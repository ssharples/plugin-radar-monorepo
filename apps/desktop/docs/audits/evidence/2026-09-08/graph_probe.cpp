#include "core/ChainProcessor.h"
#include "audio/DryWetMixProcessor.h"
#include "audio/LatencyCompensationProcessor.h"
#include <iostream>
#include <map>
#include <chrono>

// Test-only factory: never registers, scans or opens installed plugins or user caches.
static std::map<std::string,int> calls;
static std::map<std::string,bool> alive;
class Synthetic final : public juce::AudioPluginInstance {
public:
    Synthetic(const juce::PluginDescription& d):AudioPluginInstance(BusesProperties().withInput("in",juce::AudioChannelSet::stereo(),true).withOutput("out",juce::AudioChannelSet::stereo(),true)),desc(d){setLatencySamples(d.uniqueId);alive[desc.name.toStdString()]=true;}
    ~Synthetic() override{alive[desc.name.toStdString()]=false;}
    void fillInPluginDescription(juce::PluginDescription& d) const override{d=desc;}
    const juce::String getName() const override{return desc.name;}
    void prepareToPlay(double,int) override{for(auto& r:ring)r.assign(std::max(1,getLatencySamples()),0);pos=0;}
    void releaseResources() override{}
    void processBlock(juce::AudioBuffer<float>& b,juce::MidiBuffer& midi) override{
        ++calls[desc.name.toStdString()];
        if(desc.name.startsWith("note"))midi.addEvent(juce::MidiMessage::noteOn(1,desc.name.substring(4).getIntValue(),(juce::uint8)100),0);
        for(int i=0;i<b.getNumSamples();++i){
            for(int ch=0;ch<2;++ch){float v=b.getSample(ch,i);if(getLatencySamples()>0){float old=ring[ch][pos];ring[ch][pos]=v;v=old;}b.setSample(ch,i,v*(desc.name=="gain2"?2.0f:1.0f));}
            pos=(pos+1)%ring[0].size();
        }
    }
    bool hasEditor() const override{return false;}juce::AudioProcessorEditor* createEditor() override{return nullptr;}
    double getTailLengthSeconds() const override{return 0;} bool acceptsMidi() const override{return true;} bool producesMidi() const override{return true;}
    int getNumPrograms() override{return 1;}int getCurrentProgram() override{return 0;}void setCurrentProgram(int) override{}
    const juce::String getProgramName(int) override{return {};}void changeProgramName(int,const juce::String&) override{}
    void getStateInformation(juce::MemoryBlock&) override{}void setStateInformation(const void*,int) override{}
private:juce::PluginDescription desc;std::vector<float> ring[2];size_t pos=0;
};
PluginManager::PluginManager(){}
PluginManager::~PluginManager(){}
void PluginManager::timerCallback(){}
void PluginManager::changeListenerCallback(juce::ChangeBroadcaster*){}
std::unique_ptr<juce::AudioPluginInstance> PluginManager::createPluginInstance(const juce::PluginDescription& d,double,int,juce::String&){return std::make_unique<Synthetic>(d);}

static juce::PluginDescription desc(const char* name,int delay=0){juce::PluginDescription d;d.name=name;d.uniqueId=delay;d.pluginFormatName="Synthetic";d.numInputChannels=2;d.numOutputChannels=2;return d;}
static void prepare(ChainProcessor& c){c.setPlayConfigDetails(2,2,48000,512);c.prepareToPlay(48000,512);}
static float constant(ChainProcessor& c){juce::AudioBuffer<float>b(2,512);for(int ch=0;ch<2;++ch)juce::FloatVectorOperations::fill(b.getWritePointer(ch),1,512);juce::MidiBuffer midi;c.processBlock(b,midi);return b.getSample(0,511);}
static void impulse(const char* name,ChainProcessor& c){juce::AudioBuffer<float>b(2,512);b.clear();b.setSample(0,0,1);b.setSample(1,0,1);juce::MidiBuffer midi;c.processBlock(b,midi);std::cout<<name<<" tree_latency="<<c.getTotalLatencySamples()<<" graph_latency="<<c.getLatencySamples()<<" impulses=";for(int i=0;i<512;++i)if(std::abs(b.getSample(0,i))>0.0001f)std::cout<<i<<':'<<b.getSample(0,i)<<' ';std::cout<<'\n';}
int main(){
    juce::ScopedJuceInitialiser_GUI init;juce::ScopedNoDenormals nd;PluginManager manager;
    {LatencyCompensationProcessor delay(64);std::cout<<"delay_processor_inputs="<<delay.getTotalNumInputChannels()<<" delay_processor_outputs="<<delay.getTotalNumOutputChannels()<<'\n';}
    {ChainProcessor c(manager);c.addPlugin(desc("remove_before_render"));auto id=c.getRootNode().getGroup().children[0]->id;c.onParameterBindingChanged=[](){std::cout<<"removed_processor_alive_at_rebind_without_render="<<alive["remove_before_render"]<<'\n';};c.removeNode(id);}
    {
        ChainProcessor c(manager);prepare(c);c.addPlugin(desc("gain2"));auto id=c.getRootNode().getGroup().children[0]->id;
        std::cout<<"active_output="<<constant(c)<<'\n';int before=calls["gain2"];c.setNodeBypassed(id,true);std::cout<<"bypass_output="<<constant(c)<<" bypass_process_calls="<<calls["gain2"]-before<<'\n';
    }
    {
        ChainProcessor c(manager);prepare(c);c.addPlugin(desc("gain2"));auto group=c.createGroup({c.getRootNode().getGroup().children[0]->id},GroupMode::Serial,"group");
        c.setGroupDryWet(group,0);std::cout<<"first_drywet_zero_output="<<constant(c)<<'\n';
        c.setGroupMode(group,GroupMode::Serial);std::cout<<"after_rebuild_drywet_zero_output="<<constant(c)<<'\n';
    }
    {
        ChainProcessor c(manager);prepare(c);c.addPlugin(desc("delay64",64));auto group=c.createGroup({c.getRootNode().getGroup().children[0]->id},GroupMode::Serial,"drywet");
        c.setGroupDryWet(group,0.5f);c.setGroupMode(group,GroupMode::Serial);impulse("serial_drywet_pdc",c);
    }
    {
        ChainProcessor c(manager);prepare(c);c.addPlugin(desc("pass"));c.addPlugin(desc("delay64",64));
        auto id1=c.getRootNode().getGroup().children[0]->id,id2=c.getRootNode().getGroup().children[1]->id;
        c.createGroup({id1,id2},GroupMode::Parallel,"parallel");impulse("parallel_pdc",c);
        c.setBranchMute(id2,true);impulse("muted_long_branch",c);
    }
    {
        ChainProcessor c(manager);prepare(c);c.addPlugin(desc("note60"));c.addPlugin(desc("note72"));
        c.createGroup({c.getRootNode().getGroup().children[0]->id,c.getRootNode().getGroup().children[1]->id},GroupMode::Parallel,"midi");
        juce::AudioBuffer<float>b(2,512);b.clear();juce::MidiBuffer midi;c.processBlock(b,midi);std::cout<<"parallel_midi_notes=";for(auto m:midi)if(m.getMessage().isNoteOn())std::cout<<m.getMessage().getNoteNumber()<<' ';std::cout<<'\n';
    }
    {
        ChainProcessor c(manager);prepare(c);c.addPlugin(desc("pass"));
        auto child=c.createGroup({c.getRootNode().getGroup().children[0]->id},GroupMode::Serial,"inner");
        c.addPlugin(desc("pass2"));auto other=c.getRootNode().getGroup().children[1]->id;
        c.createGroup({child,other},GroupMode::Parallel,"outer");c.setBranchGain(child,-6);c.setBranchMute(child,true);
        auto xml=c.serializeChainToXml();c.restoreChainFromXml(*xml);
        auto* n=ChainNodeHelpers::findById(c.getRootNode(),child);
        std::cout<<"restored_group_branch_gain="<<n->branchGainDb<<" restored_group_mute="<<n->mute<<'\n';
    }
    std::cout<<"synthetic_add_timings_ms=";
    {ChainProcessor c(manager);prepare(c);for(int i=1;i<=20;++i){auto t=std::chrono::steady_clock::now();c.addPlugin(desc("pass"));auto ms=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-t).count();if(i==1||i==5||i==10||i==20)std::cout<<i<<':'<<ms<<' ';}}
    std::cout<<'\n';
}
