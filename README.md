# Simple Sync

Simple & easy self-hosted obsidian sync. Everything necessary for a 1-person multi-device setup, and nothing more.

Uses a last-write-wins synchronization model, based on file modification timestamps.

## Easy to deploy
- No need for docker: self-contained binaries for every platform
- No database setup: server manages its own sqlite database

## Easy to use
- 3 click setup: server URL, vault selection, and sync frequency
- Set and Forget: No manual conflict resolution

## Setup Instructions

## TODO

- [x] Server/Client: better handling for folders
- [x] Server/Client: clean up code
- [ ] Server: test tombstone removal
- [ ] Server: add port selection, read from config file & env vars
- [ ] Server: secret based auth & tls
- [ ] Client: sync on lost focus, app load
- [ ] Client: command for syncing
- [ ] Client: settings page, configure server url and sync frequency
- [ ] Client: widget indicating when syncing, sync status
- [ ] Client: remove specific paths from esbuild config
- [ ] Publish plugin
- [ ] Test on mobile
- [ ] Publish docker image
- [ ] flesh out readme
- [ ] set up CI/CD
