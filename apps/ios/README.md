# Setto for iOS

A native **SwiftUI** client. It signs in through the same WorkOS web bridge the
CLI uses (`/cli-login`, via `ASWebAuthenticationSession` + a `setto://` callback)
and talks to Convex over its HTTP API — mirroring the shared `call(path, args)`
surface from `@setto/core`.

## Run it

The Xcode project is generated with [XcodeGen](https://github.com/yonsk/XcodeGen)
so it doesn't have to be committed:

```bash
brew install xcodegen          # once
cd apps/ios
xcodegen generate              # writes Setto.xcodeproj
open Setto.xcodeproj            # build & run in Xcode (iOS 17+)
```

## Configure

Edit `Setto/Config.swift` (or pass env vars in the Xcode scheme):

- `webURL` — your deployed web app (it performs the login). Use
  `http://localhost:3000` when running the web app locally against the simulator.
- `convexURL` — the Convex deployment URL (defaults to production).

The `setto://` URL scheme is declared in `project.yml` (→ generated Info.plist)
and is what the web bridge redirects the access token back to.

## Layout

| File | Role |
| --- | --- |
| `Config.swift` | backend + web URLs, callback scheme |
| `AuthStore.swift` | WorkOS web login, token in Keychain |
| `Keychain.swift` | tiny Keychain wrapper |
| `ConvexClient.swift` | Convex HTTP API (`call(path, type, args)`) |
| `Models.swift` | Codable views of Convex docs |
| `RootView.swift` | tabs + login + account |
| `CampaignsView.swift`, `ModelsView.swift` | example product screens |

It currently surfaces Campaigns and Models as a starting point; add screens by
calling more functions (`setto describe` lists the whole surface).
