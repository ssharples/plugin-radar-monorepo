import CryptoKit
import Foundation

final class AbletonContentBuilder {
  private var path: [String] = []
  private var tracks: [SetTrack] = []
  private var locators: [SetLocator] = []
  private var dependencies: [MediaDependency] = []
  private var currentTrack: TrackBuilder?
  private var deviceStack: [DeviceBuilder] = []
  private var currentClip: ClipBuilder?
  private var currentLocator: LocatorBuilder?
  private var fileReferenceStack: [FileReferenceBuilder] = []
  private var trackSequence = 0
  private var deviceSequence = 0
  private var clipSequence = 0
  private var locatorSequence = 0

  private(set) var tempo: Double?

  var content: AbletonSetContent {
    AbletonSetContent(
      tempo: tempo,
      locators: locators,
      tracks: tracks,
      dependencies: dependencies
    )
  }

  func didStartElement(_ name: String, attributes: [String: String]) {
    path.append(name)

    if let kind = trackKind(for: name) {
      trackSequence += 1
      currentTrack = TrackBuilder(
        depth: path.count,
        sequence: trackSequence,
        xmlID: attributes["Id"],
        kind: kind,
        rootElement: name
      )
    }

    if let clipKind = clipKind(for: name), currentTrack != nil {
      clipSequence += 1
      currentClip = ClipBuilder(
        depth: path.count,
        sequence: clipSequence,
        xmlID: attributes["Id"],
        kind: clipKind,
        rootElement: name,
        placement: clipPlacement(for: path),
        eventTime: attributes["Time"].flatMap(Double.init)
      )
    }

    if isDeviceRoot(name), currentTrack != nil {
      deviceSequence += 1
      let builder = DeviceBuilder(
        depth: path.count,
        sequence: deviceSequence,
        trackID: currentTrack?.id ?? "track",
        xmlID: attributes["Id"],
        rootElement: name
      )
      deviceStack.append(builder)
    }

    // A device owns only its own state. Nested device state is represented by the
    // nested SetDevice tree, so hashing it into every ancestor is both redundant
    // and extremely expensive for large Racks and opaque plug-in buffers.
    deviceStack.last?.recordStart(name: name, attributes: attributes)

    if name == "Locator" {
      locatorSequence += 1
      currentLocator = LocatorBuilder(
        depth: path.count,
        sequence: locatorSequence,
        xmlID: attributes["Id"]
      )
    }

    if name == "FileRef", currentClip != nil || !deviceStack.isEmpty {
      fileReferenceStack.append(
        FileReferenceBuilder(
          depth: path.count,
          clipOwned: currentClip != nil,
          deviceStackDepth: deviceStack.count
        )
      )
    }

    captureSetValue(name: name, attributes: attributes)
    captureTrackValue(name: name, attributes: attributes)
    captureClipValue(name: name, attributes: attributes)
    captureDeviceValue(name: name, attributes: attributes)
    captureLocatorValue(name: name, attributes: attributes)
    captureFileReferenceValue(name: name, attributes: attributes)
  }

  func foundCharacters(_ characters: String) {
    deviceStack.last?.recordCharacters(characters)
  }

  func didEndElement(_ name: String) {
    deviceStack.last?.recordEnd(name: name)

    if let referenceBuilder = fileReferenceStack.last,
      referenceBuilder.depth == path.count,
      name == "FileRef"
    {
      fileReferenceStack.removeLast()
      if let reference = referenceBuilder.reference {
        if referenceBuilder.clipOwned {
          currentClip?.references.append(reference)
        } else if referenceBuilder.deviceStackDepth > 0,
          referenceBuilder.deviceStackDepth <= deviceStack.count
        {
          deviceStack[referenceBuilder.deviceStackDepth - 1].resourceReferences.append(reference)
        }
      }
    }

    if let clip = currentClip, clip.depth == path.count, name == clip.rootElement {
      let finalized = clip.finalize()
      currentTrack?.clips.append(finalized)
      if let reference = finalized.sampleReference {
        dependencies.append(
          MediaDependency(
            id: StableID.forValue("clip:\(finalized.id):\(reference)"),
            kind: .clipAudio,
            reference: reference,
            resolvedURL: nil,
            availability: .unresolved,
            ownerID: finalized.id
          )
        )
      }
      currentClip = nil
    }

    if let device = deviceStack.last, device.depth == path.count, name == device.rootElement {
      let finalized = device.finalize()
      deviceStack.removeLast()
      if let parent = deviceStack.last {
        parent.nestedDevices.append(finalized)
      } else {
        currentTrack?.devices.append(finalized)
      }
      appendDeviceDependencies(finalized)
    }

    if let locator = currentLocator, locator.depth == path.count, name == "Locator" {
      locators.append(locator.finalize())
      currentLocator = nil
    }

    if let track = currentTrack, track.depth == path.count, name == track.rootElement {
      tracks.append(track.finalize())
      currentTrack = nil
    }

    path.removeLast()
  }

  private func captureSetValue(name: String, attributes: [String: String]) {
    if name == "Manual",
      pathHasSuffix(["MainTrack", "DeviceChain", "Mixer", "Tempo", "Manual"])
        || pathHasSuffix(["MasterTrack", "DeviceChain", "Mixer", "Tempo", "Manual"])
    {
      tempo = attributes["Value"].flatMap(Double.init)
    }
  }

  private func captureTrackValue(name: String, attributes: [String: String]) {
    guard let track = currentTrack else { return }
    let value = attributes["Value"]

    switch name {
    case "EffectiveName"
    where path.count == track.depth + 2 && pathElement(fromEnd: 1) == "Name":
      track.effectiveName = value
    case "UserName"
    where path.count == track.depth + 2 && pathElement(fromEnd: 1) == "Name":
      track.userName = value
    case "Color" where path.count == track.depth + 1:
      track.colorIndex = value.flatMap(Int.init)
    case "TrackGroupId" where path.count == track.depth + 1:
      track.groupTrackXMLID = value
    case "IsFolded" where path.count == track.depth + 1:
      track.isFolded = value.flatMap(parseBool)
    case "IsSoloed" where path.count == track.depth + 1:
      track.isSoloed = value.flatMap(parseBool)
    case "Manual" where deviceStack.isEmpty:
      switch (pathElement(fromEnd: 2), pathElement(fromEnd: 1)) {
      case ("Mixer", "Volume"): track.volume = value.flatMap(Double.init)
      case ("Mixer", "Pan"): track.pan = value.flatMap(Double.init)
      case ("Mixer", "Speaker"): track.speakerOn = value.flatMap(parseBool)
      default: break
      }
    case "IsArmed"
    where pathElement(fromEnd: 2) == "MainSequencer"
      && pathElement(fromEnd: 1) == "Recorder":
      track.isArmed = value.flatMap(parseBool)
    case "MonitoringEnum" where pathElement(fromEnd: 1) == "MainSequencer":
      track.monitoringMode = value.flatMap(Int.init)
    default:
      break
    }
  }

  private func captureClipValue(name: String, attributes: [String: String]) {
    guard let clip = currentClip else { return }
    let value = attributes["Value"]

    switch name {
    case "Name" where path.count == clip.depth + 1:
      clip.name = value
    case "CurrentStart" where path.count == clip.depth + 1:
      clip.startBeat = value.flatMap(Double.init)
    case "CurrentEnd" where path.count == clip.depth + 1:
      clip.endBeat = value.flatMap(Double.init)
    case "LoopStart" where path.contains("Loop"):
      clip.loopStartBeat = value.flatMap(Double.init)
    case "LoopEnd" where path.contains("Loop"):
      clip.loopEndBeat = value.flatMap(Double.init)
    case "LoopOn" where path.contains("Loop"):
      clip.loopEnabled = value.flatMap(parseBool)
    case "IsWarped" where path.count == clip.depth + 1:
      clip.isWarped = value.flatMap(parseBool)
    case "WarpMode" where path.count == clip.depth + 1:
      clip.warpMode = value.flatMap(Int.init)
    case "WarpMarker":
      clip.warpMarkerCount += 1
    case "MidiNoteEvent":
      clip.midiNoteCount += 1
    default:
      break
    }
  }

  private func captureDeviceValue(name: String, attributes: [String: String]) {
    guard let device = deviceStack.last else { return }
    let value = attributes["Value"]

    let parent = pathElement(fromEnd: 1)
    switch name {
    case "UserName" where path.count == device.depth + 1:
      device.userName = value
    case "Manual"
    where path.count == device.depth + 2 && parent == "On":
      device.isEnabled = value.flatMap(parseBool)
    case "AuPluginInfo":
      device.pluginFormat = .audioUnit
    case "Vst3PluginInfo":
      device.pluginFormat = .vst3
    case "VstPluginInfo":
      device.pluginFormat = .vst2
    case "Name" where parent == "AuPluginInfo" || parent == "Vst3PluginInfo":
      device.pluginName = value
    case "PlugName" where parent == "VstPluginInfo":
      device.pluginName = value
    case "Manufacturer" where parent == "AuPluginInfo":
      device.pluginManufacturer = value
    case "Vendor" where parent == "Vst3PluginInfo" || parent == "VstPluginInfo":
      device.pluginManufacturer = value
    case "Uid" where parent == "Vst3PluginInfo":
      device.pluginIdentifier = value
    case "Version"
    where parent == "AuPluginInfo" || parent == "Vst3PluginInfo"
      || parent == "VstPluginInfo":
      device.pluginVersion = value
    case "ComponentType", "ComponentSubType",
      "ComponentManufacturer"
    where parent == "AuPluginInfo":
      device.pluginIdentifierParts.append(value ?? "")
    default:
      break
    }
  }

  private func captureLocatorValue(name: String, attributes: [String: String]) {
    guard let locator = currentLocator else { return }
    if path.count == locator.depth + 1, name == "Name" {
      locator.name = attributes["Value"]
    } else if path.count == locator.depth + 1, name == "Time" {
      locator.beatTime = attributes["Value"].flatMap(Double.init)
    }
  }

  private func captureFileReferenceValue(name: String, attributes: [String: String]) {
    guard let reference = fileReferenceStack.last else { return }
    if name == "Path" {
      reference.absolutePath = attributes["Value"]
    } else if name == "RelativePath" {
      reference.relativePath = attributes["Value"]
    }
  }

  private func appendDeviceDependencies(_ device: SetDevice) {
    for reference in device.resourceReferences {
      dependencies.append(
        MediaDependency(
          id: StableID.forValue("device:\(device.id):\(reference)"),
          kind: .deviceResource,
          reference: reference,
          resolvedURL: nil,
          availability: .unresolved,
          ownerID: device.id
        )
      )
    }
    for nested in device.nestedDevices {
      appendDeviceDependencies(nested)
    }
  }

  private func pathHasSuffix(_ suffix: [String]) -> Bool {
    guard path.count >= suffix.count else { return false }
    let offset = path.count - suffix.count
    for index in suffix.indices where path[offset + index] != suffix[index] {
      return false
    }
    return true
  }

  private func pathElement(fromEnd offset: Int) -> String? {
    let index = path.count - 1 - offset
    return index >= 0 ? path[index] : nil
  }

  private func trackKind(for element: String) -> SetTrackKind? {
    switch element {
    case "AudioTrack": .audio
    case "MidiTrack": .midi
    case "GroupTrack": .group
    case "ReturnTrack": .returnTrack
    case "MainTrack", "MasterTrack": .main
    default: nil
    }
  }

  private func clipKind(for element: String) -> SetClipKind? {
    switch element {
    case "AudioClip": .audio
    case "MidiClip": .midi
    default: nil
    }
  }

  private func clipPlacement(for path: [String]) -> SetClipPlacement {
    if path.contains("TakeLane") { return .takeLane }
    if path.contains("ClipSlot") { return .session }
    if path.contains("ArrangerAutomation") { return .arrangement }
    return .unknown
  }

  private func isDeviceRoot(_ element: String) -> Bool {
    path.dropLast().last == "Devices" && element != "Devices"
  }
}

private final class TrackBuilder {
  let depth: Int
  let sequence: Int
  let xmlID: String?
  let kind: SetTrackKind
  let rootElement: String
  let id: String
  var effectiveName: String?
  var userName: String?
  var colorIndex: Int?
  var groupTrackXMLID: String?
  var isFolded: Bool?
  var volume: Double?
  var pan: Double?
  var speakerOn: Bool?
  var isSoloed: Bool?
  var isArmed: Bool?
  var monitoringMode: Int?
  var devices: [SetDevice] = []
  var clips: [SetClip] = []

  init(depth: Int, sequence: Int, xmlID: String?, kind: SetTrackKind, rootElement: String) {
    self.depth = depth
    self.sequence = sequence
    self.xmlID = xmlID
    self.kind = kind
    self.rootElement = rootElement
    id = StableID.forValue("track:\(xmlID ?? "none"):\(sequence):\(kind.rawValue)")
  }

  func finalize() -> SetTrack {
    let preferredName = userName?.trimmingCharacters(in: .whitespacesAndNewlines)
    let fallbackName = effectiveName?.trimmingCharacters(in: .whitespacesAndNewlines)
    let name =
      preferredName?.isEmpty == false
      ? preferredName!
      : fallbackName?.isEmpty == false ? fallbackName! : kind.defaultName
    return SetTrack(
      id: id,
      xmlID: xmlID,
      kind: kind,
      name: name,
      colorIndex: colorIndex,
      groupTrackXMLID: groupTrackXMLID,
      isFolded: isFolded,
      mixer: TrackMixerState(
        volume: volume,
        pan: pan,
        speakerOn: speakerOn,
        isSoloed: isSoloed,
        isArmed: isArmed,
        monitoringMode: monitoringMode
      ),
      devices: devices,
      clips: clips
    )
  }
}

private final class DeviceBuilder {
  let depth: Int
  let sequence: Int
  let xmlID: String?
  let rootElement: String
  let id: String
  var userName: String?
  var isEnabled: Bool?
  var pluginFormat: PluginFormat?
  var pluginName: String?
  var pluginManufacturer: String?
  var pluginIdentifier: String?
  var pluginVersion: String?
  var pluginIdentifierParts: [String] = []
  var nestedDevices: [SetDevice] = []
  var resourceReferences: [MediaReference] = []
  private var hasher = SHA256()

  init(
    depth: Int,
    sequence: Int,
    trackID: String,
    xmlID: String?,
    rootElement: String
  ) {
    self.depth = depth
    self.sequence = sequence
    self.xmlID = xmlID
    self.rootElement = rootElement
    id = StableID.forValue("device:\(trackID):\(xmlID ?? "none"):\(sequence):\(rootElement)")
  }

  func recordStart(name: String, attributes: [String: String]) {
    updateHasher("<\(name)")
    for (key, value) in attributes.sorted(by: { $0.key < $1.key }) {
      updateHasher(" \(key)=\(value)")
    }
    updateHasher(">")
  }

  func recordCharacters(_ characters: String) {
    updateHasher(characters)
  }

  func recordEnd(name: String) {
    updateHasher("</\(name)>")
  }

  func finalize() -> SetDevice {
    let digest = hasher.finalize().map { String(format: "%02x", $0) }.joined()
    let identifier =
      pluginIdentifier
      ?? (pluginIdentifierParts.isEmpty ? nil : pluginIdentifierParts.joined(separator: ":"))
    let plugin = pluginFormat.map {
      PluginIdentity(
        format: $0,
        name: pluginName,
        manufacturer: pluginManufacturer,
        identifier: identifier,
        version: pluginVersion
      )
    }
    let customName = userName?.trimmingCharacters(in: .whitespacesAndNewlines)
    let displayName = customName?.isEmpty == false ? customName! : pluginName ?? rootElement
    return SetDevice(
      id: id,
      xmlID: xmlID,
      kind: deviceKind,
      typeName: rootElement,
      displayName: displayName,
      isEnabled: isEnabled,
      plugin: plugin,
      stateDigest: digest,
      nestedDevices: nestedDevices,
      resourceReferences: Array(Set(resourceReferences))
    )
  }

  private var deviceKind: SetDeviceKind {
    if rootElement == "AuPluginDevice" || pluginFormat == .audioUnit { return .audioUnit }
    if pluginFormat == .vst3 { return .vst3 }
    if pluginFormat == .vst2 { return .vst2 }
    if rootElement.hasPrefix("MxDevice") { return .maxForLive }
    if rootElement.contains("GroupDevice") || rootElement == "DrumGroupDevice" { return .rack }
    if rootElement.hasPrefix("Proxy") { return .placeholder }
    return .native
  }

  private func updateHasher(_ value: String) {
    if value.utf8.withContiguousStorageIfAvailable({ buffer in
      hasher.update(bufferPointer: UnsafeRawBufferPointer(buffer))
    }) == nil {
      hasher.update(data: Data(value.utf8))
    }
  }
}

private final class ClipBuilder {
  let depth: Int
  let sequence: Int
  let xmlID: String?
  let kind: SetClipKind
  let rootElement: String
  let placement: SetClipPlacement
  let eventTime: Double?
  var name: String?
  var startBeat: Double?
  var endBeat: Double?
  var loopStartBeat: Double?
  var loopEndBeat: Double?
  var loopEnabled: Bool?
  var isWarped: Bool?
  var warpMode: Int?
  var warpMarkerCount = 0
  var midiNoteCount = 0
  var references: [MediaReference] = []

  init(
    depth: Int,
    sequence: Int,
    xmlID: String?,
    kind: SetClipKind,
    rootElement: String,
    placement: SetClipPlacement,
    eventTime: Double?
  ) {
    self.depth = depth
    self.sequence = sequence
    self.xmlID = xmlID
    self.kind = kind
    self.rootElement = rootElement
    self.placement = placement
    self.eventTime = eventTime
  }

  func finalize() -> SetClip {
    let id = StableID.forValue("clip:\(xmlID ?? "none"):\(sequence):\(kind.rawValue)")
    return SetClip(
      id: id,
      xmlID: xmlID,
      kind: kind,
      placement: placement,
      name: name?.isEmpty == false ? name! : kind.defaultName,
      startBeat: startBeat ?? eventTime,
      endBeat: endBeat,
      loopStartBeat: loopStartBeat,
      loopEndBeat: loopEndBeat,
      loopEnabled: loopEnabled,
      isWarped: isWarped,
      warpMode: warpMode,
      warpMarkerCount: warpMarkerCount,
      midiNoteCount: midiNoteCount,
      sampleReference: references.first
    )
  }
}

private final class FileReferenceBuilder {
  let depth: Int
  let clipOwned: Bool
  let deviceStackDepth: Int
  var absolutePath: String?
  var relativePath: String?

  init(depth: Int, clipOwned: Bool, deviceStackDepth: Int) {
    self.depth = depth
    self.clipOwned = clipOwned
    self.deviceStackDepth = deviceStackDepth
  }

  var reference: MediaReference? {
    guard absolutePath?.isEmpty == false || relativePath?.isEmpty == false else { return nil }
    return MediaReference(absolutePath: absolutePath, relativePath: relativePath)
  }
}

private final class LocatorBuilder {
  let depth: Int
  let sequence: Int
  let xmlID: String?
  var name: String?
  var beatTime: Double?

  init(depth: Int, sequence: Int, xmlID: String?) {
    self.depth = depth
    self.sequence = sequence
    self.xmlID = xmlID
  }

  func finalize() -> SetLocator {
    SetLocator(
      id: StableID.forValue("locator:\(xmlID ?? "none"):\(sequence)"),
      name: name?.isEmpty == false ? name! : "Locator \(sequence)",
      beatTime: beatTime ?? 0
    )
  }
}

private func parseBool(_ value: String) -> Bool? {
  switch value.lowercased() {
  case "true", "1": true
  case "false", "0": false
  default: nil
  }
}

extension SetTrackKind {
  fileprivate var defaultName: String {
    switch self {
    case .audio: "Audio Track"
    case .midi: "MIDI Track"
    case .group: "Group"
    case .returnTrack: "Return"
    case .main: "Main"
    }
  }
}

extension SetClipKind {
  fileprivate var defaultName: String {
    switch self {
    case .audio: "Audio Clip"
    case .midi: "MIDI Clip"
    }
  }
}
