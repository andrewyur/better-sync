import { App, FileSystemAdapter, Vault } from "obsidian";
import { Config } from "./setup";
import fs from "fs"
import crypto from "crypto"
import path from "path";
import { pipeline } from "stream/promises";
import { Reactive } from "@vue/reactivity";

type State = {
  [path: string]: StateEntry
}

type StateEntry = {
  hash: string
  modifiedAt: number
  deleted: boolean
  dir: boolean
}

function getVaultRoot(vault: Vault) {
  let adapter = vault.adapter;
  if (adapter instanceof FileSystemAdapter) {
    return adapter.getBasePath();
  }
  throw Error("Could not get vault root")
}

export async function sync(app: App, config: Reactive<Config>) {
  const [clientState, serverState] = await Promise.all([getClientState(app.vault), getServerState(config)])

  console.log(clientState, serverState)

  const ops: Promise<void>[] = []
  const urlPrefix = config.serverUrl + '/vault/' + config.vaultId + '/file/'
  const vaultRoot = getVaultRoot(app.vault)

  for (const [filePath, serverFile] of Object.entries(serverState)) {
    // if both have file
    // if server version deleted 
    // if client modified at is more recent than server, upload, else client delete
    // else 
    // if hashes dont match, upload if client version is newer, else download
    // if server has file and client does not
    // if not deleted
    // if modifiedAt is newer than lastUpdated, download, else delete

    const clientFile = clientState[filePath]

    if (clientFile) {
      if (serverFile.deleted) {
        if (clientFile.modifiedAt > serverFile.modifiedAt) {
          ops.push(uploadEntry(filePath, clientFile, vaultRoot, urlPrefix))
        } else {
          ops.push(clientDelete(filePath, clientFile, vaultRoot))
        }
        continue
      }

      if (clientFile.hash === serverFile.hash) {
        continue
      }

      if (clientFile.modifiedAt > serverFile.modifiedAt) {
        ops.push(uploadEntry(filePath, clientFile, vaultRoot, urlPrefix))
      } else if (clientFile.modifiedAt < serverFile.modifiedAt) {
        ops.push(downloadEntry(filePath, clientFile, vaultRoot, urlPrefix))
      }
    } else {
      if (serverFile.modifiedAt > config.lastSynced) {
        ops.push(downloadEntry(filePath, serverFile, vaultRoot, urlPrefix))
      } else {
        serverFile.modifiedAt = Date.now()
        ops.push(serverDelete(filePath, serverFile, urlPrefix))
      }
    }
  }

  for (const [filePath, clientFile] of Object.entries(clientState)) {
    // if client has file and server does not
    // if newer than last sync, upload, else delete
    const serverFile = serverState[filePath]
    if (!serverFile) {
      if (clientFile.modifiedAt > config.lastSynced) {
        ops.push(uploadEntry(filePath, clientFile, vaultRoot, urlPrefix))
      } else {
        ops.push(clientDelete(filePath, clientFile, vaultRoot))
      }
    }
  }

  await Promise.all(ops)

  // update sync time
  config.lastSynced = Date.now()
}


async function serverDelete(filePath: string, state: StateEntry, urlPrefix: string) {
  const resp = await fetch(urlPrefix + filePath, {
    method: "DELETE",
    headers: {
      "X-Modified-At": state.modifiedAt.toString()
    }
  })

  if (!resp.ok) {
    throw Error(await resp.text() || resp.statusText)
  }
}

async function clientDelete(filePath: string, state: StateEntry, vaultRoot: string) {
  const fullPath = path.join(vaultRoot, filePath)
  if (state.dir) {
    await fs.promises.rmdir(fullPath)
  } else {
    await fs.promises.rm(fullPath)
  }
}

async function downloadEntry(filePath: string, state: StateEntry, vaultRoot: string, urlPrefix: string) {
  const fullPath = path.join(vaultRoot, filePath)

  if (state.dir) {
    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true })

    const resp = await fetch(urlPrefix + filePath)
    if (!resp.ok) {
      throw Error(resp.statusText)
    }

    await pipeline(resp.body as ReadableStream, fs.createWriteStream(fullPath))
  } else {
    await fs.promises.mkdir(fullPath)
  }
}

async function uploadEntry(filePath: string, state: StateEntry, vaultRoot: string, urlPrefix: string) {
  const fullPath = path.join(vaultRoot, filePath)

  const resp = await fetch(urlPrefix + filePath, {
    method: "POST",
    headers: {
      "X-Modified-At": state.modifiedAt.toString(),
      "X-Is-Dir": String(state.dir)
    },
    ...(state.dir ? {} : { body: await fs.promises.readFile(fullPath) })
  })

  if (!resp.ok) {
    throw Error(await resp.text() || resp.statusText)
  }
}

async function getServerState(config: Config): Promise<State> {
  const resp = await fetch(config.serverUrl + '/vault/' + config.vaultId + '/state')

  if (!resp.ok) {
    throw Error(await resp.text() || resp.statusText)
  }

  return await resp.json() as State
}

async function getClientState(vault: Vault): Promise<State> {
  let vaultRoot = getVaultRoot(vault)

  let clientState: State = {}

  await Promise.all([
    ...vault.getAllFolders().map(async (dir) => {
      const fullPath = path.join(vaultRoot, dir.path)
      const stat = await fs.promises.stat(fullPath)
      clientState[dir.path] = {
        hash: "",
        modifiedAt: stat.ctime.getTime(),
        dir: true,
        deleted: false,
      }
    }),
    ...vault.getFiles().map(async (file) => {
      const filePath = path.join(vaultRoot, file.path)
      const buffer = await fs.promises.readFile(filePath)
      clientState[file.path] = {
        hash: crypto.hash('sha256', buffer),
        modifiedAt: file.stat.mtime,
        dir: false,
        deleted: false
      }
    })
  ])

  return clientState
}
