import os
from pathlib import Path
import re,shlex,subprocess
base=Path(os.environ['PROCHAIN_AUDIT_WORK']);src=Path(os.environ['PROCHAIN_AUDIT_REPO'])/'apps/desktop/src'
flags=(base/'build/CMakeFiles/PluginChainManager_Tests.dir/flags.make').read_text();args=[]
for field in ['CXX_DEFINES','CXX_INCLUDES','CXX_FLAGS']:args+=shlex.split(re.search(r'^'+field+r' = (.*)$',flags,re.M).group(1))
objects=[]
for f in [base/'graph_probe.cpp',src/'core/ChainProcessor.cpp',src/'audio/NodeMeterProcessor.cpp']:
    o=base/(f.stem+'.o');subprocess.run(['/usr/bin/c++',*args,'-I'+str(src),'-c',str(f),'-o',str(o)],check=True);objects.append(str(o))
objroot=base/'build/CMakeFiles/PluginChainManager_Tests.dir'
for f in ['core/ChainNode.cpp.o','audio/AudioMeter.cpp.o','audio/BranchGainProcessor.cpp.o','audio/DryWetMixProcessor.cpp.o','audio/LatencyCompensationProcessor.cpp.o']:objects.append(str(objroot/'src'/f))
objects+=list(map(str,objroot.glob('**/modules/**/*.o')))
link=shlex.split((objroot/'link.txt').read_text());frameworks=link[link.index('-framework'):]
subprocess.run(['/usr/bin/c++','-O3',*objects,*frameworks,'-o',str(base/'graph_probe')],check=True)
