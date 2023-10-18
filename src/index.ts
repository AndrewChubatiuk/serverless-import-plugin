import * as path from 'path'
import { statSync, realpathSync } from 'fs'
import merge from './merge'
import { tryOrUndefined, resolveModule } from './utils'

const SERVERLESS = 'serverless'
const DIRNAME = 'dirname'
const JS_EXTNAME = '.js'
const CONFIG_EXTNAMES = new Set(['.yml', '.yaml', JS_EXTNAME])
const REALPATH = realpathSync('.')

interface ServerlessLogger {
  [key: string]: (msg: string) => void
}


interface ImportedConfig {
  custom?: {
    [key: string]: object
  }
  functions?: {
    [key: string]: {
      handler?: string
    }
  }
}

interface ImportOptions {
  module: string
  inputs: any
}

interface BasedirOption {
  basedir: string
}

class ImportPlugin {

  private configurationInput: any
  private log: ServerlessLogger

  constructor(private serverless: Serverless.Instance, options: object, { log }) {
    this.configurationInput = JSON.parse(
      JSON.stringify(
        this.serverless.configurationInput,
      ),
    );
    this.log = log;
    this.importConfigs(this.configurationInput, { basedir: REALPATH });
    Object.keys(this.configurationInput).forEach((key) => {
      this.serverless.extendConfiguration([key], this.configurationInput[key])
    })
    this.serverless.service.reloadServiceFileParam();
    this.loadImportedPlugins();
  }

  private getImports(config: ImportedConfig): string[] {
    const { import: imports } = config.custom || {}
    if (Array.isArray(imports)) return imports
    if (typeof imports === 'string' && imports) return [imports]
    return []
  }

  private importConfigs(config: ImportedConfig, { basedir }: BasedirOption) {
    this.getImports(config).forEach((pathToImport) => {
      return this.importConfig(pathToImport, { basedir });
    });
  }

  private resolvePathToImport(pathToImport: string, { basedir }: BasedirOption): string {
    if (CONFIG_EXTNAMES.has(path.extname(pathToImport))) {
      if (tryOrUndefined(() => statSync(pathToImport))) {
        return pathToImport
      }
      const resolved = tryOrUndefined(() => resolveModule(pathToImport, { basedir }))
      if (resolved) {
        return resolved
      }
      throw new this.serverless.classes.Error(`
        Cannot import ${pathToImport}: the given file doesn't exist
      `)
    }

    // if directory look for config file
    const stats = tryOrUndefined(() => statSync(pathToImport))
    if (stats?.isDirectory()) {
      const tries = []
      for (const configExtname of CONFIG_EXTNAMES) {
        const possibleFile = path.join(pathToImport, SERVERLESS + configExtname)
        if (tryOrUndefined(() => statSync(possibleFile))) {
          return possibleFile
        }
        tries.push(possibleFile)
      }
      var triesStr = tries.map(t => `- ${t}`).join('\n')
      throw new this.serverless.classes.Error(`
	Cannot import ${pathToImport}: in the given directory 
	no serverless config can be found\n
	Tried:\n${triesStr}
      `)
    }

    // try to resolve as a module
    const tries = []
    for (const configExtname of CONFIG_EXTNAMES) {
      const possibleFile = path.join(pathToImport, SERVERLESS + configExtname)
      const resolved = tryOrUndefined(() => resolveModule(possibleFile, { basedir }))
      if (resolved) {
        return resolved
      }
      tries.push(possibleFile)
    }
    var triesStr = tries.map(t => `- ${t}`).join('\n')
    throw new this.serverless.classes.Error(`
      Cannot import ${pathToImport}: the given module cannot be resolved\n
      Tried:\n${triesStr}
    `)
  }

  private prepareImportedConfig(options: { importPath: string, config: ImportedConfig }) {
    const { importPath, config } = options
    const { functions } = config
    const importDir = path.relative(REALPATH, path.dirname(importPath))
    const toPosixPath = (location: string) => location.split(path.sep).join(path.posix.sep);
    if (functions != null) {
      Object.values(functions).forEach(func => {
        if (typeof func.handler === 'string') {
          func.handler = toPosixPath(path.join(importDir, func.handler));
        }
      })
    }
  }

  private importConfig(options: ImportOptions | string, { basedir }: BasedirOption) {
    const isFullOptions = typeof options === 'object' && options != null
    const realOptions = isFullOptions ? <ImportOptions>options : {
      module: options as string, inputs: {}
    }
    const { module: pathToImport, inputs } = realOptions

    this.log.info(`Importing ${pathToImport}`)
    const importPath = this.resolvePathToImport(pathToImport, { basedir })
    let config: any
    try {
      if (path.extname(importPath) === JS_EXTNAME) {
        const importExports = require(importPath)
        const importFunction = typeof importExports === 'function'
          ? importExports
          : importExports?.default
        config = importFunction(inputs)
      } else {
        config = this.serverless.utils.readFileSync(importPath)
      }
      this.prepareImportedConfig({ importPath, config })
      this.importConfigs(config, { basedir: path.dirname(importPath) })
    } catch (error) {
      var errMsg = (error as Error).message
      throw new this.serverless.classes.Error(`
        Error: Cannot import ${pathToImport}\nCause: ${errMsg}
      `)
    }
    var general = {}
    if (config?.global?.functions) {
      const functions = this.configurationInput?.functions;
      const generalFn = config?.global?.functions || {};
      general['functions'] = {}
      for (const fn of Object.keys(functions)) {
        general['functions'][fn] = generalFn;
      }
    }
    delete config['global'];
    merge(this.configurationInput, general, config)
  }

  private async loadImportedPlugins() {
    const { pluginManager } = this.serverless
    const existingPlugins = this.serverless.service.plugins || []
    const importedPlugins = this.configurationInput.plugins || []
    const newPlugins = [importedPlugins, existingPlugins].reduce((imported, existing) => {
      return imported.filter(i => !existing.includes(i))
    })
    if (typeof pluginManager.loadServicePlugins === 'function') {
      pluginManager.loadServicePlugins(newPlugins)
    } else {
      const resolvedServicePlugins = await pluginManager.resolveServicePlugins!(newPlugins)
      resolvedServicePlugins.filter(Boolean).forEach(plugin => pluginManager.addPlugin!(plugin))
    }
  }
}

module.exports = ImportPlugin
