import * as Configs from "~/configs/Config";
import * as Platform from "~/utils/Platform"

export async function boot() {
    await Platform.boot()
    await Configs.boot()
}
