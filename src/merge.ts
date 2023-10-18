import { isObject } from "./utils"

const merge = (target: any, ...sources: any): object => {
  if (sources == null) {
    return target
  }
  for (const source of sources) {
    if (source == null) {
      continue;
    }
    if (Array.isArray(target) && Array.isArray(source)) {
      // add unique elements of source into target with deep equality comparison
      return target.concat([source, target].reduce((src, tgt) => src.filter(s => !tgt.includes(s))));
    }

    Object.entries(source).forEach(([key, value]) => {
      if (isObject(value) && isObject(target[key])) {
        target[key] = merge(target[key], value)
      } else if (target[key] === undefined) {
        target[key] = value
      }
    })
  }
  return target
}

export default merge
