import * as Configs from "~/configs/Config";
import {Config} from "~/configs/Config";
import * as Platform from "~/utils/platform/Platform"
import {Disposable} from "~/utils/disposable";
import {lazy} from "~/utils/Lazy";
import {Nullable} from "~/utils/Types";
import {EntryPointType} from "~/utils/EntryPointTypes/EntryPointType";

function createContext(
    entryType: EntryPointType,
) {
    return new ExtensionEntryContext(
        entryType,
    )
}

export interface ExtensionEntrypoint {
    start(): Promise<void>

    close(): Promise<void>
}

export interface IExtensionEntryContext {
    boot(): Promise<void>

    getDisposable(): Disposable,

    getLatestConfig(): Config,
}

type EntryInitializer = (context: IExtensionEntryContext) => Promise<void>


function buildExtensionEntry(
    type: EntryPointType,
    initializationBlock: (
        context: IExtensionEntryContext,
    ) => Promise<void>,
): ExtensionEntrypoint {
    let lazyContext = lazy(() => createContext(type))

    const close = async () => {
        lazyContext.getOrNull()?.close()
    }

    const start = async () => {
        if (lazyContext.isInitialized()) {
            console.log("entrypoint already started")
            return
        }
        const context = lazyContext.get();
        try {
            await context.boot()
            await initializationBlock(context)
        } catch (e) {
            console.log("fail to finish entry point", e)
            context.close()
        }
    }
    return {start, close}
}

export class ExtensionEntryBuilder {
    private type: Nullable<EntryPointType> = null;
    private initializationBlock: Nullable<EntryInitializer> = null;

    withType(extensionEntryType: EntryPointType) {
        this.type = extensionEntryType;
        return this
    }

    withInit(initializationBlock: EntryInitializer) {
        this.initializationBlock = initializationBlock;
        return this
    }

    create(): ExtensionEntrypoint {
        if (!this.initializationBlock) {
            throw new Error("Entry initializer not provided in the builder");
        }
        if (!this.type) {
            throw new Error("Entry initializer not provided in the builder");
        }
        return buildExtensionEntry(
            this.type,
            this.initializationBlock,
        )
    }
}

class ExtensionEntryContext implements IExtensionEntryContext {
    private _disposable = lazy(() => new Disposable())

    constructor(
        public readonly entryType: EntryPointType,
    ) {

    }

    async boot() {
        await Platform.boot(this.entryType.providers.platformInfoProvider)
        await Configs.boot()
    }

    getDisposable(): Disposable {
        return this._disposable.get()
    }

    getLatestConfig(): Config {
        return Configs.getLatestConfig()
    }

    close(): void {
        this._disposable.getOrNull()?.dispose()
    }
}

export function defineExtensionEntry() {
    return new ExtensionEntryBuilder()
}
