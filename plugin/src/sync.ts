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
          if (clientFile.dir) {
            ops.push(uploadDir(filePath, clientFile.modifiedAt, config))
          } else {
            ops.push(uploadFile(filePath, clientFile.modifiedAt, app.vault, config))
          }
        } else {
          ops.push(clientDelete(filePath, clientFile.dir, app.vault))
        }
        continue
      } 

      if(clientFile.hash === serverFile.hash) {
        continue
      }

      if(clientFile.modifiedAt > serverFile.modifiedAt) {
        if (clientFile.dir) {
          ops.push(uploadDir(filePath, clientFile.modifiedAt, config))
        } else {
          ops.push(uploadFile(filePath, clientFile.modifiedAt, app.vault, config))
        }
      } else if (clientFile.modifiedAt < serverFile.modifiedAt) {
        if (clientFile.dir) {
          ops.push(createDir(filePath, app.vault))
        } else {
          ops.push(downloadFile(filePath, app.vault, config))
        }
      }
    } else {
      if(serverFile.modifiedAt > config.lastSynced) {
        if (serverFile.dir) {
          ops.push(createDir(filePath, app.vault))
        } else {
          ops.push(downloadFile(filePath, app.vault, config))
        }
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
        if (clientFile.dir) {
          ops.push(uploadDir(filePath, clientFile.modifiedAt, config))
        } else {
          ops.push(uploadFile(filePath, clientFile.modifiedAt, app.vault, config))
        }
      } else {
        ops.push(clientDelete(filePath, clientFile.dir, app.vault))
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
    modifiedAt: number
    deleted: boolean
    dir: boolean
  }
}

async function serverDelete(filePath: string, modifiedAt: number, config: Config) {
  const resp = await fetch(config.serverUrl + '/vault/' + config.vaultId + '/file/' + filePath, {
    method: "DELETE",
    headers: {
      "X-Modified-At": modifiedAt.toString()
    }
  })
  
  if (!resp.ok) {
    throw Error(await resp.text() || resp.statusText)
  }
}

async function clientDelete(filePath: string, dir: boolean, vault: Vault) {
  const fullPath = path.join(getVaultRoot(vault), filePath)
  if (dir) {
    await fs.promises.rmdir(fullPath)
  } else {
    await fs.promises.rm(fullPath)
  }
}

async function createDir(dirPath: string, vault: Vault) {
  const fullPath = path.join(getVaultRoot(vault), dirPath)
  await fs.promises.mkdir(fullPath)
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

async function uploadDir(dirPath: string, modifiedAt: number, config: Config) {
  const resp = await fetch(config.serverUrl + '/vault/' + config.vaultId + '/file/' + dirPath, {
    method: "POST",
    headers: {
      "X-Modified-At": modifiedAt.toString(),
      "X-Is-Dir": "true"
    }
  })
  if (!resp.ok) {
    throw Error(resp.statusText)
  }

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

async function getClientState(vault: Vault): Promise<Map<string, {hash: string, modifiedAt: number, dir: boolean }>> {
  let vaultRoot = getVaultRoot(vault)
  
  let clientState: Map<string, {hash: string, modifiedAt: number, dir: boolean}> = new Map()

  await Promise.all(vault.getAllFolders().map(async (dir) => {
    const fullPath = path.join(vaultRoot, dir.path)
    const stat = await fs.promises.stat(fullPath)
    clientState.set(dir.path, {
      hash: "",
      modifiedAt: stat.ctime.getTime(),
      dir: true,
    })
  }))

  await Promise.all(vault.getFiles().map(async (file) => {
    const filePath = path.join(vaultRoot, file.path)
    const buffer = await fs.promises.readFile(filePath)
    clientState.set(file.path, {
      hash: crypto.hash('sha256', buffer),
      modifiedAt: file.stat.mtime,
      dir: false
    })
  }))
  
  return clientState
}
