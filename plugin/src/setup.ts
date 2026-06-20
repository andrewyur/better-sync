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
    resolve!: () => void
    constructor(app: App, config: Config) {
        super(app);
        this.config = config
        this.setTitle("Better Sync Setup");
        this.urlInput()

        this.finish = new Promise((resolve) => {
            this.resolve = resolve
        })
    }

    onClose(): void {
        this.resolve()
    }

    navigateTo(f: () => void) {
        this.setContent("")
        f.call(this)
    }

    urlInput() {
        let url: string = '';

        new Setting(this.contentEl)
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
                    if (!res.ok) {
                        btn.setButtonText("Next")
                        new Notice("Could not connect to server:\n" + res.error);
                    } else {
                        this.config.serverUrl = url;
                        this.navigateTo(this.vaultChoice)
                    }
                })
            );
    }

    vaultChoice() {
        new Setting(this.contentEl)
            .setDesc("Create a new remote vault, or add an existing one?")
            .setName("Choose Vault Setup")
            .addButton(btn => btn
                .setButtonText("Create New")
                .onClick(() => this.navigateTo(this.createVault))
            )
            .addButton(btn => btn
                .setButtonText("Add Existing")
                .onClick(() => this.navigateTo(this.chooseExisting))
            )
    }

    createVault() {
        let vaultId = ""

        new Setting(this.contentEl)
            .setName("New Vault ID")
            .setDesc("A unique identifier for this remote vault")
            .addText(txt => txt
                .setPlaceholder("newVault")
                .onChange(v => vaultId = v)
            )

        new Setting(this.contentEl)
            .addButton(btn => btn
                .setCta()
                .setButtonText("Next")
                .onClick(async () => {
                    btn.setButtonText("Loading...")
                    let res = await createVault(this.config.serverUrl, vaultId)
                    if (!res.ok) {
                        new Notice("Could not create new vault:\n" + res.error)
                        btn.setButtonText("Next")
                    } else {
                        this.config.vaultId = vaultId
                        this.config.initialized = true
                        this.navigateTo(this.completeSetup)
                    }
                })
            )
    }

    async chooseExisting() {
        let res = await getVaults(this.config.serverUrl)

        let vaults: string[] = []
        if (!res.ok) {
            new Notice("Error fetching vaults:\n" + res.error)
        } else {
            vaults = res.value
        }

        if (vaults.length == 0) {
            this.navigateTo(this.createVault)
            new Notice("No existing vaults found, create a new one")
            return
        }

        let vaultId = vaults[0]!
        const idMap: Record<string, string> = {}
        vaults.forEach(id => {
            idMap[id] = id
        })

        new Setting(this.contentEl)
            .setName("Select Existing Vault")
            .setDesc("Select the ID of the remote vault you want to clone")
            .addDropdown(drp => drp
                .addOptions(idMap)
                .setValue(vaultId)
                .onChange(v => vaultId = v)
            )

        new Setting(this.contentEl)
            .addButton(btn => btn
                .setCta()
                .setButtonText("Next")
                .onClick(() => {
                    this.config.vaultId = vaultId
                    this.config.initialized = true
                    this.navigateTo(this.completeSetup)
                })
            )
    }
    async completeSetup() {
        this.setContent("Setup complete!")
        new Setting(this.contentEl)
            .addButton(btn => btn
                .setButtonText("Finish")
                .setCta()
                .onClick(() => this.close())
            )
    }
}

type Result<T> = { 
    ok: true,
    value: T
} | {
    ok: false,
    error: string
}

async function getVaults(url: string): Promise<Result<string[]>> {
    try {
        const resp = await fetch(url + "/vault")

        if (!resp.ok) {
            throw Error(resp.statusText)
        }

        return {
            value: await resp.json() as string[],
            ok: true
        }
    } catch (e) {
        return {
            ok: false,
            error: (e as Error).message,
        }
    }
}

async function createVault(url: string, vaultId: string): Promise<Result<null>> {
    try {
        const resp = await fetch(url + "/vault", {
            method: "POST",
            body: vaultId
        })

        if (!resp.ok) {
            throw Error(await resp.text() || resp.statusText)
        }

        return {
            ok: true,
            value: null
        }
    } catch (e) {
        return {
            ok: false,
            error: (e as Error).message
        }
    }
}

async function testUrl(url: string): Promise<Result<null>> {
    try {
        const resp = await fetch(url + "/bing")

        if (!resp.ok) {
            throw Error(resp.statusText)
        }

        if (await resp.text() !== "bong") {
            throw Error("Wrong server type")
        }

        return {
            ok: true,
            value: null
        }
    } catch (e) {
        return {
            ok: false,
            error: (e as Error).message
        }
    }
}
