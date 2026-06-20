import { Plugin } from "obsidian";
import { Config, SetupModal, DEFAULT_CONFIG } from "./setup";
import { reactive, Reactive, watch } from "@vue/reactivity";
import { sync } from "./sync";

export default class SimpleSync extends Plugin {
  config!: Reactive<Config>
  timer!: NodeJS.Timeout
  async onload() {
    await this.loadConfig()
    if(!this.config.initialized) {
      const modal = new SetupModal(this.app, this.config)
      modal.open()
      await modal.finish
    }
    console.log(this.config)

    sync(this.app, this.config)

    this.timer = setInterval(() => sync(this.app, this.config), 1000 * 30)
  }

  async onunload(): Promise<void> {
    clearInterval(this.timer)
  }

  async loadConfig() {
    const base: Config = Object.assign({}, DEFAULT_CONFIG, await this.loadData())
    this.config = reactive(base)
    watch(this.config, async (value: Config, _) => {
      await this.saveData(value)
    })
  }
}
