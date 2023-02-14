declare class ServerlessError {
  constructor(message: string)
}

interface ServerlessPlugin { }

interface VariableProperty {
  path: string[]
  value: string
}

interface VariableMatch {
  match: string
  variable: string
}

declare namespace Serverless {
  interface Instance {
    service: {
      reloadServiceFileParam: () => void
      plugins?: string[]
      custom?: {
        [key: string]: object
      }
    }

    configurationInput: any

    extendConfiguration: (keys: string[], input: any) => void

    utils: {
      readFileSync: (path: string) => object
    }

    cli: {
      log(str: string): void
    }

    classes: {
      Error: { new(message: string): ServerlessError }
    }

    pluginManager: {
      loadServicePlugins?: (plugins: string[]) => void
      resolveServicePlugins?: (plugins: string[]) => ServerlessPlugin[]
      addPlugin?: (plugin: ServerlessPlugin) => void
    }
  }
}
