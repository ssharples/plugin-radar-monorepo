import os
from pathlib import Path
import re, shlex, subprocess
base=Path(os.environ['PROCHAIN_AUDIT_WORK'])
src=Path(os.environ['PROCHAIN_AUDIT_REPO'])/'apps/desktop/src/audio'
h=(src/'AudioMeter.h').read_text(); cpp=(src/'AudioMeter.cpp').read_text()
for cls in ['RollingAudioMeter','PeakAudioMeter']:
    hh=h.replace('AudioMeter',cls); cc=cpp.replace('AudioMeter',cls)
    if cls=='RollingAudioMeter':
        hh=hh.replace('int lufsWritePos = 0;', 'int lufsWritePos = 0;\n    double runningL = 0, runningR = 0;')
        cc=cc.replace('lufsWritePos = 0;', 'lufsWritePos = 0; runningL = runningR = 0;')
        cc=cc.replace('lufsBufferL[lufsWritePos] =', 'runningL -= lufsBufferL[lufsWritePos];\n        runningR -= lufsBufferR[lufsWritePos];\n        lufsBufferL[lufsWritePos] =')
        cc=cc.replace('lufsWritePos = (lufsWritePos + 1)', 'runningL += lufsBufferL[lufsWritePos];\n        runningR += lufsBufferR[lufsWritePos];\n        lufsWritePos = (lufsWritePos + 1)')
        old='''float sumL = 0.0f;
    float sumR = 0.0f;
    for (int i = 0; i < lufsBufferSize; ++i)
    {
        sumL += lufsBufferL[i];
        sumR += lufsBufferR[i];
    }'''
        assert old in cc
        cc=cc.replace(old,'double sumL = runningL;\n    double sumR = runningR;')
    else:
        a=cc.index('    // K-weighted LUFS calculation'); b=cc.index('\n}\n',a)
        cc=cc[:a]+cc[b:]
    (base/(cls+'.h')).write_text(hh);(base/(cls+'.cpp')).write_text(cc)
flags=(base/'build/CMakeFiles/PluginChainManager_Tests.dir/flags.make').read_text()
args=[]
for field in ['CXX_DEFINES','CXX_INCLUDES','CXX_FLAGS']:
    args+=shlex.split(re.search(r'^'+field+r' = (.*)$',flags,re.M).group(1))
objects=[]
for f in [src/'AudioMeter.cpp',base/'RollingAudioMeter.cpp',base/'PeakAudioMeter.cpp',base/'meter_bench.cpp']:
    o=base/(f.stem+'.o');subprocess.run(['/usr/bin/c++',*args,'-I'+str(src),'-I'+str(base),'-c',str(f),'-o',str(o)],check=True);objects.append(str(o))
juceobjs=list((base/'build/CMakeFiles/PluginChainManager_Tests.dir').glob('**/modules/**/*.o'))
assert juceobjs
link=shlex.split((base/'build/CMakeFiles/PluginChainManager_Tests.dir/link.txt').read_text())
frameworks=link[link.index('-framework'):]
subprocess.run(['/usr/bin/c++','-O3',*objects,*map(str,juceobjs),*frameworks,'-o',str(base/'meter_bench')],check=True)
