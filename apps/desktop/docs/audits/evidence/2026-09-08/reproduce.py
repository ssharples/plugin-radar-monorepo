"""Run synthetic audit probes in a fresh directory; never build/install AU or VST3 targets."""
from pathlib import Path
import argparse, os, shutil, subprocess, tempfile

p=argparse.ArgumentParser()
p.add_argument('--repo',type=Path,required=True)
p.add_argument('--work',type=Path)
p.add_argument('--jobs',type=int,default=6)
a=p.parse_args();repo=a.repo.resolve()
work=a.work.resolve() if a.work else Path(tempfile.mkdtemp(prefix='prochain-audit-'))
if a.work: work.mkdir(parents=True,exist_ok=False)
here=Path(__file__).resolve().parent
for name in ['meter_bench.cpp','graph_probe.cpp','prepare_bench.py','build_graph_probe.py']:
    shutil.copy2(here/name,work/name)
env=os.environ.copy();env['PROCHAIN_AUDIT_REPO']=str(repo);env['PROCHAIN_AUDIT_WORK']=str(work)
def run(cmd,log):
    with (work/log).open('w') as f: subprocess.run(list(map(str,cmd)),env=env,stdout=f,stderr=subprocess.STDOUT,check=True)
config=['cmake','-S',repo/'apps/desktop','-B',work/'build','-DCMAKE_BUILD_TYPE=Release']
for dep in ['JUCE','Catch2']:
    local=repo/'apps/desktop/build/_deps'/(dep.lower()+'-src')
    if local.exists(): config.append('-DFETCHCONTENT_SOURCE_DIR_'+dep.upper()+'='+str(local))
run(config,'configure.log')
run(['cmake','--build',work/'build','--target','PluginChainManager_Tests','PluginChainManager','-j',a.jobs],'build.log')
run(['ctest','--test-dir',work/'build','--output-on-failure'],'tests.log')
run(['python3',work/'prepare_bench.py'],'bench_build.log')
run(['python3',work/'build_graph_probe.py'],'graph_build.log')
# No compilers run concurrently with these timing measurements.
with (work/'meter-results.csv').open('w') as out, (work/'meter-correctness.txt').open('w') as err:
    subprocess.run([str(work/'meter_bench')],stdout=out,stderr=err,check=True)
run([work/'graph_probe'],'graph-results.txt')
print(work)
