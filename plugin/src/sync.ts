import { App, FileSystemAdapter, Vault } from "obsidian";
import { Config } from "./setup";
import fs from "fs"
import crypto from "crypto"
import path from "path";
import { pipeline } from "stream/promises";
import { Reactive } from "@vue/reactivity";


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

  for (const [filePath, serverFile] of Object.entries(serverState)) {
    // if both have file
      // if server version deleted 
        // if client modified at is more recent than server, upload, else client delete
      // else 
        // if hashes dont match, upload if client version is newer, else download
    // if server has file and client does not
      // if not deleted
        // if modifiedAt is newer than lastUpdated, download, else delete

    const clientFile = clientState.get(filePath)

    if(clientFile) {
      if (serverFile.deleted) {
        if (clientFile.modifiedAt > serverFile.modifiedAt) {
            ops.push(uploadFile(filePath, clientFile.modifiedAt, app.vault, config))
        } else {
            ops.push(clientDelete(filePath, app.vault))
        }
        continue
      } 

      if(clientFile.hash === serverFile.hash) {
        continue
      }

      if(clientFile.modifiedAt > serverFile.modifiedAt) {
        ops.push(uploadFile(filePath, clientFile.modifiedAt, app.vault, config))
      } else if (clientFile.modifiedAt < serverFile.modifiedAt) {
        ops.push(downloadFile(filePath, app.vault, config))
      }
    } else {
      if(serverFile.modifiedAt > config.lastSynced) {
        ops.push(downloadFile(filePath, app.vault, config))
      } else {
        ops.push(serverDelete(filePath, Date.now(), config))
      }
    }
  }

  for (const [filePath, clientFile] of clientState.entries()) {
    // if client has file and server does not
      // if newer than last sync, upload, else delete
    const serverFile = serverState[filePath]
    if(!serverFile) {
      if (clientFile.modifiedAt > config.lastSynced) {
        ops.push(uploadFile(filePath, clientFile.modifiedAt, app.vault, config))
      } else {
        ops.push(clientDelete(filePath, app.vault))
      }
    } 
  }

  await Promise.all(ops)

  // update sync time
  config.lastSynced = Date.now()
}

type ServerState = {
  [path: string]: {
    hash: string
    modifiedAt: number,
    deleted: boolean
  }
}

async function serverDelete(filePath: string, modifiedAt: number, config: Config) {
  const resp = await fetch(config.serverUrl + '/vault/' + config.vaultId + '/file/' + filePath, {
    method: "DEL",
    headers: {
      "X-Modified-At": modifiedAt.toString()
    }
  })
  
  if (!resp.ok) {
    throw Error(await resp.text() || resp.statusText)
  }
}

async function clientDelete(filePath: string, vault: Vault) {
  const fullPath = path.join(getVaultRoot(vault), filePath)
  await fs.promises.rm(fullPath)
}

async function downloadFile(filePath: string, vault: Vault, config: Config) {
  const fullPath = path.join(getVaultRoot(vault), filePath)
  await fs.promises.mkdir(path.dirname(fullPath), {recursive: true})

  const resp = await fetch(config.serverUrl + '/vault/' + config.vaultId + '/file/' + filePath)
  if (!resp.ok) {
    throw Error(resp.statusText)
  }

  await pipeline(resp.body as ReadableStream, fs.createWriteStream(fullPath))
}

async function uploadFile(filePath: string, modifiedAt: number, vault: Vault, config: Config) {
  const fullPath = path.join(getVaultRoot(vault), filePath)
  const fileContent = await fs.promises.readFile(fullPath)

  const resp = await fetch(config.serverUrl + '/vault/' + config.vaultId + '/file/' + filePath, {
    method: "POST",
    headers: {
      "X-Modified-At": modifiedAt.toString()
    },
    body: fileContent
  })
  
  if (!resp.ok) {
    throw Error(await resp.text() || resp.statusText)
  }
}

async function getServerState(config: Config): Promise<ServerState> {
  const resp = await fetch(config.serverUrl + '/vault/' + config.vaultId + '/state')

  if (!resp.ok) {
    throw Error(await resp.text() || resp.statusText)
  }

  return await resp.json() as ServerState
}

async function getClientState(vault: Vault): Promise<Map<string, {hash: string, modifiedAt: number}>> {
  let files = vault.getFiles()
  let vaultRoot = getVaultRoot(vault)
  console.log(vaultRoot)
  
  let bufferPromises = files.map(file => {
    const filePath = path.join(vaultRoot, file.path)
    console.log(filePath)
    return fs.promises.readFile(filePath)
  })
  let buffers = await Promise.all(bufferPromises)
  let clientState: Map<string, {hash: string, modifiedAt: number}> = new Map()
  buffers.forEach((b, i) => {
    clientState.set(files[i]!.path, {
      hash: crypto.hash('sha256', b),
      modifiedAt: files[i]!.stat.mtime
    })
  })
  return clientState
}
