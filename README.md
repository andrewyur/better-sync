# Simple Sync

Simple & easy self-hosted obsidian sync. Everything necessary for a 1-person multi-device setup, and nothing more.

Uses a last-write-wins synchronization model, based on file modified timestamps.

## Easy to deploy
- No need for docker: self-contained binaries for every platform
- No database needed: server manages its own sqlite database

## Easy to use
- 3 click setup: server 
- No manual conflict resolution

## Setup Instructions

## TODO

-[ ] Server: add port selection, read from config file & env vars
-[ ] Server: secret based auth & tls
-[ ] Client: sync on lost focus, app load
-[ ] Client: command for syncing
-[ ] Client: settings page, configure server url and sync frequency
-[ ] Client: widget indicating when syncing, sync status
-[ ] Client: remove specific paths from esbuild config
-[ ] Publish plugin
-[ ] Publish docker image
-[ ] flesh out readme
