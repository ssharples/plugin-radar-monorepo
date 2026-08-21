# Local audio analysis for Samples

Status: research and architecture recommendation, 2026-08-12. No software was installed and no app source was changed as part of this research.

## Decision

Ship the first analysis slice entirely with Apple frameworks:

1. Use `AVAudioFile` and Accelerate/vDSP for a deterministic, incrementally cached time-frequency mesh and frequency-band colour.
2. Use the built-in Sound Analysis classifier for broad, fully local label suggestions.
3. Benchmark a custom Create ML sound classifier on Studio Time Machine's actual taxonomy once reviewed labels exist.
4. Keep CLAP as an optional research candidate for flexible zero-shot labels. Do not make Python, TensorFlow, PyTorch, Essentia, YAMNet, or PANNs a production dependency until corpus benchmarks justify their runtime and distribution cost.

This route requires **no third-party end-user installation or app-bundled model checkpoint** for the first useful release. Apple's [Core ML documentation](https://developer.apple.com/documentation/coreml) says inference runs on device, can use CPU, GPU, and Neural Engine, and does not require a network connection. Sound Analysis is built on Core ML.

Most importantly, the UI must present classifications as suggestions with model/version/confidence and an abstain state. A model score is evidence, not provenance.

## 1. Frequency analysis and mesh data

### Native pipeline

`AVAudioFile` can read supported files sequentially into bounded `AVAudioPCMBuffer` chunks rather than loading a whole sample ([Apple documentation](https://developer.apple.com/documentation/avfaudio/avaudiofile)). For each chunk:

1. Downmix only for analysis while retaining original channel metadata.
2. Split into overlapping frames (initial benchmark: 2,048 or 4,096 samples, 50% hop).
3. Apply a Hann window to reduce spectral leakage.
4. Run a real FFT with Accelerate/vDSP and calculate power per bin.
5. Ignore DC and sub-audible energy below 20 Hz; apply a per-frame dB floor so silence/noise does not dominate.
6. Aggregate onto 32-64 log-frequency bands and 48-96 time slices for a compact cached mesh.

Apple documents both the [FFT component-frequency technique](https://developer.apple.com/documentation/accelerate/finding-the-component-frequencies-in-a-composite-sine-wave) and [Hann-windowed spectrogram construction](https://developer.apple.com/documentation/accelerate/visualizing-sound-as-an-audio-spectrogram). The latter explicitly uses time, frequency, and amplitude as the spectrogram dimensions and notes that mel bands are useful for perceptual audio classification.

### Persisted descriptors

Store a versioned analysis row keyed by the indexed file identity and modification evidence:

- quantized time x log-frequency energy grid for the mesh;
- integrated energy proportions for sub (20-60 Hz), bass (60-250 Hz), low-mid (250-500 Hz), mid (500 Hz-2 kHz), presence (2-6 kHz), and air (6 kHz-Nyquist);
- spectral centroid and 85%/95% rolloff;
- peak frequency as a secondary observation, not the single "main frequency";
- RMS/peak level, crest factor, silence ratio, and analysis duration;
- analyzer schema/version and completion/error state.

A 48 x 32 `UInt8` grid is 1,536 bytes before database overhead, so it is reasonable to cache for a library of this scale. Recompute only when file evidence or analyzer version changes. Schedule selected/visible and used samples first, then fill the rest at low priority while roots are available.

### Mesh and colour contract

- `x = time`, `y = log frequency`, `z = normalized dB energy`.
- Vertex brightness/opacity follows energy; hue follows frequency.
- Blend the integrated bands continuously: bass-heavy audio trends red, low-mid orange, mid yellow, presence green/cyan, and high-frequency audio blue/violet.
- Saturation follows spectral concentration, so broadband/full-range material does not falsely appear as one categorical colour.
- Accompany colour with the named dominant band and percentages. Colour alone is not an accessible or sufficiently precise measurement.

This makes “all low end = red” a deterministic visualization rule without pretending that one FFT peak describes an entire sample.

## 2. Content tagging options

| Option | What it can provide | Installation and runtime | Size and licensing | Recommendation |
| --- | --- | --- | --- | --- |
| **Apple Sound Analysis, built-in classifier** | More than 300 event/instrument categories and time-ranged confidence results. Apple shows file classification producing acoustic guitar, tambourine, and snare-drum results. | No third-party install or user-managed checkpoint. `SNAudioFileAnalyzer` accepts Core Audio-supported compressed and uncompressed files; Core ML runs locally and selects Apple compute hardware. | Model size is OS-managed. Platform framework terms apply. | **Ship first.** Lowest integration, privacy, and distribution risk; benchmark because it is broad rather than sample-library-specific. |
| **Custom Create ML `MLSoundClassifier`** | Exactly the reviewed taxonomy the app needs, including one-shot/loop and studio-specific subclasses, if the training corpus represents them. | Train with Create ML; export Core ML; infer through the same Sound Analysis API. Apple asks for at least ten examples per class plus a negative class, though production quality needs much more varied data. | Model size depends on training parameters; Core ML model ships with the app or can be separately managed. | **Preferred specialization path** after enough durable user confirmations and a held-out evaluation set exist. |
| **YAMNet** | 521 fixed AudioSet event classes plus per-0.96-second scores and 1,024-dimensional embeddings. Useful as a portable baseline. | Official setup requires Python, NumPy, resampy, TensorFlow, `tf-keras`, and soundfile; 16 kHz mono input. The current repo warns that it uses Keras 2 and is incompatible with Keras 3. | 3.7M weights; the official HDF5 weight file is about 15.3 MB. TensorFlow Model Garden code is Apache-2.0. | **Benchmark only.** Compact, but less native and operationally worse than Apple's built-in model for the same broad AudioSet-style role. |
| **PANNs Cnn14** | 527 AudioSet tags and a 2,048-dimensional embedding; the project reports 0.431 AudioSet mAP for Cnn14 and 0.439 for Wavegram-Logmel-CNN. | `pip install panns-inference`; requires PyTorch. First-party examples are Python/CUDA-oriented, with no native Swift or Core ML deployment path supplied. | MIT code. The official Zenodo record declares CC BY 4.0 for weights; Cnn14 checkpoints are about 312 MiB (32 kHz) or 342 MiB (16 kHz). | **Do not ship initially.** Consider only if a controlled benchmark materially beats Sound Analysis on important classes. |
| **Essentia + Essentia models** | Strong music-specific assets: a 40-class MTG-Jamendo instrument head includes bass, drums, guitar, piano, synthesizer, and voice; separate voice/instrumental models exist. | `pip install essentia-tensorflow` is documented for macOS. Native embedding would require C++/TensorFlow packaging; Apple Silicon wheel support is not explicitly guaranteed by the cited install page and must be tested. | Essentia is AGPLv3 or commercial. Its first-party pages conflict on model terms: the model catalogue says CC BY-NC-SA 4.0, while the licensing page says CC BY-NC-ND 4.0; both point commercial products to proprietary licensing. | **License-blocked for production** until UPF confirms terms. Useful only for an internal benchmark under appropriate terms. |
| **LAION-CLAP / Transformers CLAP** | Zero-shot similarity between audio and arbitrary text prompts, so candidate labels can evolve without retraining. | `pip install laion-clap`, or PyTorch + Hugging Face Transformers. After weights are downloaded it can run offline, but the official LAION environment is Python/PyTorch and does not provide a native Apple deployment. | LAION repo is CC0; the Hugging Face `laion/clap-htsat-fused` card says Apache-2.0. A single PyTorch or SafeTensors checkpoint is about 614-615 MB; the current repository is 1.23 GB because it contains both formats. Training-data/checkpoint rights still need release review. | **Best flexible-label experiment, not the default.** Large and prompt-sensitive; use a separate optional worker only if accuracy justifies it. |
| **Microsoft CLAP** | Zero-shot audio/text similarity and optional captioning; first-party API exposes CPU inference. | `pip install msclap`; Python runtime and auto-downloaded weights. No first-party native Swift path. | MIT repository. Confirm checkpoint-specific redistribution terms before bundling. | Alternative CLAP benchmark, not a production dependency yet. |

Primary sources:

- Apple [Sound Analysis overview](https://developer.apple.com/documentation/soundanalysis/), [`SNClassifySoundRequest`](https://developer.apple.com/documentation/soundanalysis/snclassifysoundrequest), and [file-classification example](https://developer.apple.com/documentation/soundanalysis/classifying-sounds-in-an-audio-file).
- Apple [built-in classifier WWDC21 session](https://developer.apple.com/videos/play/wwdc2021/10036/), which states that the built-in model recognizes over 300 categories and supports 0.5-15 second windows.
- Apple [`MLSoundClassifier`](https://developer.apple.com/documentation/createml/mlsoundclassifier/).
- TensorFlow [YAMNet repository and model details](https://github.com/tensorflow/models/tree/master/research/audioset/yamnet), [YAMNet tutorial](https://www.tensorflow.org/hub/tutorials/yamnet), and [Apache-licensed model code](https://github.com/tensorflow/models/blob/master/research/audioset/yamnet/yamnet.py).
- PANNs [research repository](https://github.com/qiuqiangkong/audioset_tagging_cnn), [inference package](https://github.com/qiuqiangkong/panns_inference), and [official Zenodo model record/API](https://zenodo.org/api/records/3987831).
- Essentia [model catalogue](https://essentia.upf.edu/models.html), [MTG-Jamendo instrument model metadata](https://essentia.upf.edu/models/classification-heads/mtg_jamendo_instrument/mtg_jamendo_instrument-discogs-effnet-1.json), [machine-learning installation](https://essentia.upf.edu/machine_learning.html), [library repository](https://github.com/MTG/essentia), and [licensing page](https://essentia.upf.edu/licensing_information.html).
- LAION [CLAP repository](https://github.com/LAION-AI/CLAP), [paper](https://arxiv.org/abs/2211.06687), Hugging Face [CLAP implementation](https://huggingface.co/docs/transformers/model_doc/clap), and [`clap-htsat-fused` model repository](https://huggingface.co/laion/clap-htsat-fused/tree/main).
- Microsoft [CLAP repository](https://github.com/microsoft/CLAP) and [paper](https://arxiv.org/abs/2206.04769).

### Model-label examples

The built-in Sound Analysis classifier exposes labels that can support broad local
suggestions. Representative identifiers include:

- `bass_drum`, `drum`, `drum_kit`, `snare_drum`, `hi_hat`, `percussion`;
- `bass_guitar`, `double_bass`, `synthesizer`;
- `piano`, `electric_piano`, `keyboard_musical`;
- `guitar`, `acoustic_guitar`, `electric_guitar`, `guitar_strum`;
- `singing`, `choir_singing`, `rapping`, `speech`;
- `music`.

There is no exact `kick` identifier, so an app-level **Kick / bass drum** suggestion may map from `bass_drum` but must retain the raw model label. There is no built-in “master channel” label.

## 3. Truthful taxonomy

Keep three different concepts separate:

1. **Acoustic content suggestion:** kick/bass drum, bass guitar, piano, vocal/singing, guitar, percussion, synthesizer, sound effect, and so on. This may come from Sound Analysis, CLAP, or a custom model.
2. **Structural audio form:** one-shot, loop, stem, or full mix. Some forms may be weakly inferred from duration, repetition, polyphony, and classifier diversity, but should be `possible…` suggestions unless confirmed.
3. **DAW role/provenance:** track stem, group render, return, or main/master-channel render. This must come from parsed ALS/session evidence, export metadata, project paths, or a user confirmation.

**“Main channel/master” cannot be proven from audio content.** The same waveform can be placed on a regular audio track, exported from a group, or rendered from a master. Audio analysis observes the waveform, not the routing history that produced it. “Full mix” is also only a probabilistic acoustic description unless project evidence or the user confirms it. Persist these as separately scored claims with their evidence source; never collapse them into one confident content label.

## 4. Staged delivery architecture

### Stage A — deterministic mesh, no ML dependency

- Add a versioned background `SampleAudioAnalyzer` around `AVAudioFile` + vDSP.
- Write compact mesh data and spectral summaries into the sample SQLite evidence store.
- Make analysis cancellable, power-aware, and incremental; never mutate the source file.
- Render a neutral pending mesh while unavailable/offline files remain unanalyzed.

### Stage B — built-in local suggestions

- Run `SNAudioFileAnalyzer` with the built-in classifier on representative windows, not necessarily every second of a long stem.
- Persist raw per-window top results, normalized app taxonomy candidates, model identifier/version, and aggregation method.
- Require class-specific thresholds and allow “No confident suggestion.” Do not display normalized scores as calibrated certainty without validation.
- Retain durable user corrections separately from model output so re-analysis never overwrites them.

### Stage C — benchmark before adding a model

Create a stratified, human-reviewed evaluation set from the real corpus covering one-shots, loops, vocals, instruments, processed project audio, stems, full mixes, silence, and effects. Measure per-class precision/recall, abstention coverage, and errors by sample type. Compare:

1. built-in Sound Analysis;
2. a small custom Create ML classifier trained on the target taxonomy;
3. YAMNet as the compact fixed-vocabulary baseline;
4. CLAP with frozen, versioned prompt ensembles as the flexible-vocabulary baseline;
5. PANNs/Essentia only if their licensing and integration costs remain acceptable.

Promote a new model only if it materially improves important sample classes on held-out corpus data. Store raw outputs so future taxonomy changes do not erase evidence.

### Stage D — review-driven specialization

Turn accepted/rejected suggestions into a curated training/export dataset only with an explicit product policy. Train a Create ML model with a negative/other class and diverse pack/project sources, then ship a versioned Core ML asset. Keep the built-in classifier as a fallback and comparison signal.

## Final recommendation

Do not install a heavyweight analysis stack in the production app now. Implement vDSP mesh analysis and built-in Sound Analysis first; both are native, offline, Apple-Silicon-aware, and sufficient to validate the interaction model. In parallel, run a bounded CLAP versus YAMNet benchmark in an isolated development environment. Prefer a custom Create ML classifier for the eventual Studio Time Machine taxonomy if user-reviewed corpus labels prove numerous and representative enough.
