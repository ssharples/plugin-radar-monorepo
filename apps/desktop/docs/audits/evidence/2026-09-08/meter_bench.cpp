#include "AudioMeter.h"
#include "RollingAudioMeter.h"
#include "PeakAudioMeter.h"
#include <chrono>
#include <iostream>
#include <iomanip>
#include <algorithm>
#include <cmath>
#include <memory>
#include <vector>

template<class Meter> void bench(const char* variant, int count, double sr, int block) {
    juce::ScopedNoDenormals nd;
    std::vector<std::unique_ptr<Meter>> meters;
    for (int i=0;i<count;++i) {
        auto m=std::make_unique<Meter>(); m->prepareToPlay(sr,block); meters.push_back(std::move(m));
    }
    juce::AudioBuffer<float> audio(2,block);
    for(int i=0;i<block;++i) {audio.setSample(0,i,0.2f*std::sin(i*0.131f));audio.setSample(1,i,0.2f*std::cos(i*0.071f));}
    auto process=[&] {for(auto& m:meters)m->process(audio);};
    for(int i=0;i<32;++i)process();
    std::vector<double> times;times.reserve(600);
    for(int i=0;i<600;++i){
        auto t=std::chrono::steady_clock::now();process();
        times.push_back(std::chrono::duration<double,std::micro>(std::chrono::steady_clock::now()-t).count());
    }
    std::sort(times.begin(),times.end());
    double mean=0;for(auto t:times)mean+=t;mean/=times.size();
    std::cout<<variant<<','<<count<<','<<sr<<','<<block<<','<<mean<<','<<times[300]<<','<<times[594]<<','<<times.back()<<','<<100*times[300]/(1e6*block/sr)<<'\n'<<std::flush;
}
int main(){
    std::cout<<std::fixed<<std::setprecision(3);
    std::cout<<"variant,meters,sample_rate,block,mean_us,p50_us,p99_us,max_us,p50_deadline_percent\n";
    struct C{int meters;double sr;int block;};
    for(auto c:{C{2,48000,64},C{42,48000,64},C{42,48000,256},C{42,48000,512},C{82,48000,64},C{42,96000,64}}){
        bench<AudioMeter>("current",c.meters,c.sr,c.block);
        bench<RollingAudioMeter>("experimental_running_sum",c.meters,c.sr,c.block);
        bench<PeakAudioMeter>("experimental_peak_rms_only",c.meters,c.sr,c.block);
    }
    AudioMeter current;RollingAudioMeter candidate;
    current.prepareToPlay(48000,64);candidate.prepareToPlay(48000,64);
    juce::AudioBuffer<float> b(2,64);double maxDiff=0;
    for(int k=0;k<3750;++k){
        for(int i=0;i<64;++i){float s=0.2f*std::sin((k*64+i)*0.13f);b.setSample(0,i,s);b.setSample(1,i,s*0.7f);}
        current.process(b);candidate.process(b);
        maxDiff=std::max(maxDiff,double(std::abs(current.getReadings().lufsShort-candidate.getReadings().lufsShort)));
    }
    std::cerr<<"max_lufs_delta_db_five_seconds="<<maxDiff<<'\n';
    for(int bs:{64,512}){
        AudioMeter m;m.prepareToPlay(48000,bs);juce::AudioBuffer<float> x(2,bs);
        for(int ch=0;ch<2;++ch)juce::FloatVectorOperations::fill(x.getWritePointer(ch),0.5f,bs);
        for(int n=0;n<48000;n+=bs)m.process(x);
        std::cerr<<"rms_after_one_second_block="<<bs<<" value="<<m.getReadings().rmsL<<'\n';
    }
}
