import { Modal, App, Setting, Notice } from "obsidian";

export type Config = {
    serverUrl: string;
    vaultId: string;
    initialized: boolean;
    lastSynced: number;
};
export const DEFAULT_CONFIG: Config = {
    serverUrl: "",
    vaultId: "",
    initialized: false,
    lastSynced: 0
};


export class SetupModal extends Modal {
    finish: Promise<void>
    config: Config
    resolve: () => void
    constructor(app: App, config: Config) {
        super(app);
        this.config = config
        this.setTitle("Better Sync Setup");
        this.addSettingsInputs()

        // dummy assignment to keep ts happy
        this.resolve = () => {}
        this.finish = new Promise((resolve) => {
            this.resolve = resolve
        })
    }

    onClose(): void {
        this.resolve()
    }
    
    addSettingsInputs() {
    
        let url: string = '';

        const urlInput = new Setting(this.contentEl)
            .setName("Server URL")
            .setDesc("The URL to your better-sync server")
            .addText(text => text
                .setPlaceholder("http://example.com")
                .onChange(v => url = v)
            );

        new Setting(this.contentEl)
            .addButton(btn => btn
                .setButtonText("Next")
                .setCta()
                .onClick(async () => {
                    btn.setButtonText("Loading...")
                    const res = await testUrl(url);
                    if (res) {
                        btn.setButtonText("Next")
                        new Notice("Could not connect to server:\n" + res);
                        urlInput.setErrorMessage;
                    } else {
                        this.config.serverUrl = url;
                        this.setContent("")
                        this.addChoice()
                    }
                })
            );
    }
    addChoice() {
        new Setting(this.contentEl)
            .setDesc("Create a new remote vault, or add an existing one?")
            .setName("Vault Type")
            .addButton(btn => btn
                .setButtonText("Create New")
                .onClick(() => {
                    this.setContent("")
                    this.addNew()
                })
            )
            .addButton(btn => btn
                .setButtonText("Add Existing")
                .onClick(() => {
                    this.setContent("")
                    this.addExisting()
                })
            )
    }
    addNew() {
        let vaultId = ""
        
        new Setting(this.contentEl)
            .setName("Vault ID")
            .setDesc("A unique identifier for this remote vault")
            .addText(txt => txt
                .setPlaceholder("vault123")
                .onChange(v => vaultId = v)
            )

        new Setting(this.contentEl)
            .addButton(btn => btn
                .setCta()
                .setButtonText("Next")
                .onClick(async () => {
                    btn.setButtonText("Loading...")
                    let res = await createVault(this.config.serverUrl, vaultId)
                    if(res) {
                        new Notice("Could not create new vault:\n" + res)
                        btn.setButtonText("Next")
                    } else {
                        this.setContent("")
                        this.config.vaultId = vaultId
                        this.config.initialized = true
                        this.addComplete()
                    }
                })
            )
    }
    async addExisting() {
        
        let vaultsRes = await getVaults(this.config.serverUrl)
        
        let vaults: Record<string, string>
        if (typeof vaultsRes == "string") {
            vaults = {}
            new Notice("Error fetching vaults:\n"+vaultsRes)
        } else {
            vaults = vaultsRes
        }

        const vaultNames = Object.keys(vaults)
        if(vaultNames.length == 0) {
            this.setContent("")
            this.addNew()
            new Notice("No existing vaults found")
            return
        }


        let vaultId = vaultNames[0]!
        
        new Setting(this.contentEl)
            .setName("Select Vault")
            .setDesc("Select the ID of the remote vault you want to clone")
            .addDropdown(drp => drp
                .addOptions(vaults)
                .setValue(vaultId)
                .onChange(v => vaultId = v)
            )
        
        new Setting(this.contentEl)
            .addButton(btn => btn
                .setCta()
                .setButtonText("Next")
                .onClick(() => {
                    this.setContent("")
                    this.config.vaultId = vaultId
                    this.config.initialized = true
                    this.addComplete()
                })
            )
    }    
    async addComplete() {
        this.setContent("Setup complete!")
        new Setting(this.contentEl)
            .addButton(btn => btn
                .setButtonText("Finish")
                .setCta()
                .onClick(() => {
                    this.close()
                })
            )
    }
}

async function getVaults(url: string): Promise<Record<string, string> | string> {
    try {
        const resp = await fetch(url + "/vault")

        if (!resp.ok) {
            throw Error(resp.statusText)
        }

        const ids = await resp.json() as string[]

        const idMap: Record<string, string> = {}
        ids.forEach(id => {
            idMap[id] = id   
        })

        return idMap
    } catch(e) {
        return (e as Error).message
    } 
}

async function createVault(url: string, vaultId: string): Promise<string | undefined>{
    try {
        const resp = await fetch(url + "/vault", {
            method: "POST",
            body: vaultId
        })

        if (!resp.ok) {
            return await resp.text() || resp.statusText
        }
    } catch(e) {
        return (e as Error).message
    }
} 

async function testUrl(url: string): Promise<string | undefined> {
    try {
        const resp = await fetch(url + "/bing")

        if (!resp.ok) {
            throw Error(resp.statusText)
        }

        if (await resp.text() !== "bong") {
            throw Error("Wrong server type")
        }
    } catch(e) {
        return (e as Error).message
    }
}
