import CryptoKit
import Darwin
import Foundation

struct ProjectFallbackFileObservation: Sendable, Equatable {
  let relativePath: String
  let bytes: Int64
  let sha256: String
}

protocol ProjectFallbackFileVerifying: Sendable {
  func verify(fileURL: URL, inside projectRoot: URL) throws -> ProjectFallbackFileObservation
}

struct ProjectFallbackFileVerifier: ProjectFallbackFileVerifying {
  let duringRead: @Sendable (URL) throws -> Void

  init(duringRead: @escaping @Sendable (URL) throws -> Void = { _ in }) {
    self.duringRead = duringRead
  }

  func verify(fileURL: URL, inside projectRoot: URL) throws -> ProjectFallbackFileObservation {
    let lexical = fileURL.standardizedFileURL
    let lexicalRoot = projectRoot.standardizedFileURL
    let canonicalRoot = lexicalRoot.resolvingSymlinksInPath().standardizedFileURL
    let resolvedBefore = lexical.resolvingSymlinksInPath().standardizedFileURL
    guard lexicalRoot == canonicalRoot, lexical == resolvedBefore,
      isDescendant(lexical, of: canonicalRoot)
    else {
      throw ProjectFallbackFileVerificationError.unsafePath
    }

    var pathBefore = stat()
    guard lstat(lexical.path, &pathBefore) == 0,
      (pathBefore.st_mode & S_IFMT) == S_IFREG,
      pathBefore.st_size > 0
    else { throw ProjectFallbackFileVerificationError.notRegularNonEmptyFile }

    let descriptor = open(lexical.path, O_RDONLY | O_NOFOLLOW)
    guard descriptor >= 0 else { throw ProjectFallbackFileVerificationError.unsafePath }
    defer { close(descriptor) }

    var openedBefore = stat()
    guard fstat(descriptor, &openedBefore) == 0,
      sameIdentityAndMetadata(pathBefore, openedBefore)
    else { throw ProjectFallbackFileVerificationError.changedWhileReading }

    var hasher = SHA256()
    var buffer = [UInt8](repeating: 0, count: 1_048_576)
    var invokedHook = false
    while true {
      let count = Darwin.read(descriptor, &buffer, buffer.count)
      guard count >= 0 else { throw ProjectFallbackFileVerificationError.readFailed }
      if count == 0 { break }
      hasher.update(data: Data(buffer[0..<count]))
      if !invokedHook {
        invokedHook = true
        try duringRead(lexical)
      }
    }

    var openedAfter = stat()
    var pathAfter = stat()
    let resolvedAfter = lexical.resolvingSymlinksInPath().standardizedFileURL
    guard fstat(descriptor, &openedAfter) == 0,
      lstat(lexical.path, &pathAfter) == 0,
      (pathAfter.st_mode & S_IFMT) == S_IFREG,
      lexical == resolvedAfter,
      isDescendant(resolvedAfter, of: canonicalRoot),
      sameIdentityAndMetadata(openedBefore, openedAfter),
      sameIdentityAndMetadata(openedAfter, pathAfter)
    else { throw ProjectFallbackFileVerificationError.changedWhileReading }

    return ProjectFallbackFileObservation(
      relativePath: String(lexical.path.dropFirst(canonicalRoot.path.count + 1)),
      bytes: Int64(openedAfter.st_size),
      sha256: FileContentDigest.hex(hasher.finalize())
    )
  }

  private func sameIdentityAndMetadata(_ left: stat, _ right: stat) -> Bool {
    left.st_dev == right.st_dev
      && left.st_ino == right.st_ino
      && left.st_size == right.st_size
      && left.st_mtimespec.tv_sec == right.st_mtimespec.tv_sec
      && left.st_mtimespec.tv_nsec == right.st_mtimespec.tv_nsec
  }

  private func isDescendant(_ child: URL, of parent: URL) -> Bool {
    child.path == parent.path || child.path.hasPrefix(parent.path + "/")
  }
}

enum ProjectFallbackFileVerificationError: Error, Equatable {
  case unsafePath
  case notRegularNonEmptyFile
  case changedWhileReading
  case readFailed
}
