import { useEffect, useRef, ReactNode, ReactElement, FunctionComponent, isValidElement, useContext, useState } from 'react'
import { Dimensions, StyleSheet } from 'react-native'
import { isObject, hasOwn, diffAndCloneA, error, warn } from '@mpxjs/utils'
import { VarContext } from './context'
import { ExpressionParser, parseFunc, ReplaceSource } from './parser'

export const TEXT_STYLE_REGEX = /color|font.*|text.*|letterSpacing|lineHeight|includeFontPadding|writingDirection/
export const PERCENT_REGEX = /^\s*-?\d+(\.\d+)?%\s*$/
export const URL_REGEX = /^\s*url\(["']?(.*?)["']?\)\s*$/
export const BACKGROUND_REGEX = /^background(Image|Size|Repeat|Position)$/
export const TEXT_PROPS_REGEX = /ellipsizeMode|numberOfLines/
export const DEFAULT_FONT_SIZE = 16

export function rpx (value: number) {
  const { width } = Dimensions.get('screen')
  // rn 单位 dp = 1(css)px =  1 物理像素 * pixelRatio(像素比)
  // px = rpx * (750 / 屏幕宽度)
  return value * width / 750
}

const rpxRegExp = /^\s*(-?\d+(\.\d+)?)rpx\s*$/
const pxRegExp = /^\s*(-?\d+(\.\d+)?)(px)?\s*$/
const hairlineRegExp = /^\s*hairlineWidth\s*$/
const varDecRegExp = /^--.*/
const varUseRegExp = /var\(/
const calcUseRegExp = /calc\(/

export function omit<T, K extends string> (obj: T, fields: K[]): Omit<T, K> {
  const shallowCopy: any = Object.assign({}, obj)
  for (let i = 0; i < fields.length; i += 1) {
    const key = fields[i]
    delete shallowCopy[key]
  }
  return shallowCopy
}

/**
 * 用法等同于 useEffect，但是会忽略首次执行，只在依赖更新时执行
 */
export const useUpdateEffect = (effect: any, deps: any) => {
  const isMounted = useRef(false)

  // for react-refresh
  useEffect(() => {
    return () => {
      isMounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true
    } else {
      return effect()
    }
  }, deps)
}

/**
 * 解析行内样式
 * @param inlineStyle
 * @returns
 */
export const parseInlineStyle = (inlineStyle = ''): Record<string, string> => {
  return inlineStyle.split(';').reduce((styleObj, style) => {
    const [k, v, ...rest] = style.split(':')
    if (rest.length || !v || !k) return styleObj
    const key = k.trim().replace(/-./g, c => c.substring(1).toUpperCase())
    return Object.assign(styleObj, { [key]: v.trim() })
  }, {})
}

export const parseUrl = (cssUrl = '') => {
  if (!cssUrl) return
  const match = cssUrl.match(URL_REGEX)
  return match?.[1]
}

export const getRestProps = (transferProps: any = {}, originProps: any = {}, deletePropsKey: any = []) => {
  return {
    ...transferProps,
    ...omit(originProps, deletePropsKey)
  }
}

export function isText (ele: ReactNode): ele is ReactElement {
  if (isValidElement(ele)) {
    const displayName = (ele.type as FunctionComponent)?.displayName
    return displayName === 'mpx-text' || displayName === 'Text'
  }
  return false
}

export function isEmbedded (ele: ReactNode): ele is ReactElement {
  if (isValidElement(ele)) {
    const displayName = (ele.type as FunctionComponent)?.displayName || ''
    return ['mpx-checkbox', 'mpx-radio', 'mpx-switch'].includes(displayName)
  }
  return false
}

export function every (children: ReactNode, callback: (children: ReactNode) => boolean) {
  const childrenArray = Array.isArray(children) ? children : [children]
  return childrenArray.every((child) => callback(child))
}

type GroupData<T> = Record<string, Partial<T>>
export function groupBy<T extends Record<string, any>> (
  obj: T,
  callback: (key: string, val: T[keyof T]) => string,
  group: GroupData<T> = {}
): GroupData<T> {
  Object.entries(obj).forEach(([key, val]) => {
    const groupKey = callback(key, val)
    group[groupKey] = group[groupKey] || {}
    group[groupKey][key as keyof T] = val
  })
  return group
}

export function splitStyle<T extends Record<string, any>> (styleObj: T): {
  textStyle?: Partial<T>;
  backgroundStyle?: Partial<T>;
  innerStyle?: Partial<T>;
} {
  return groupBy(styleObj, (key) => {
    if (TEXT_STYLE_REGEX.test(key)) {
      return 'textStyle'
    } else if (BACKGROUND_REGEX.test(key)) {
      return 'backgroundStyle'
    } else {
      return 'innerStyle'
    }
  }) as {
    textStyle: Partial<T>;
    backgroundStyle: Partial<T>;
    innerStyle: Partial<T>;
  }
}

const percentRule: Record<string, string> = {
  translateX: 'width',
  translateY: 'height',
  borderTopLeftRadius: 'width',
  borderBottomLeftRadius: 'width',
  borderBottomRightRadius: 'width',
  borderTopRightRadius: 'width',
  borderRadius: 'width'
}

const heightPercentRule: Record<string, boolean> = {
  translateY: true,
  top: true,
  bottom: true,
  marginTop: true,
  marginBottom: true,
  marginVertical: true,
  paddingTop: true,
  paddingBottom: true,
  paddingVertical: true
}

// todo calc时处理角度和时间等单位
function formatValue (value: string) {
  let matched
  if ((matched = pxRegExp.exec(value))) {
    return +matched[1]
  } else if ((matched = rpxRegExp.exec(value))) {
    return rpx(+matched[1])
  } else if (hairlineRegExp.test(value)) {
    return StyleSheet.hairlineWidth
  }
  return value
}

function transformPercent (styleObj: Record<string, any>, percentKeyPaths: Array<Array<string>>, { width, height }: { width?: number, height?: number }) {
  percentKeyPaths.forEach((percentKeyPath) => {
    setStyle(styleObj, percentKeyPath, ({ target, key, value }) => {
      const percentage = parseFloat(value) / 100
      const type = percentRule[key]
      if (type === 'height' && height) {
        target[key] = percentage * height
      } else if (type === 'width' && width) {
        target[key] = percentage * width
      } else {
        target[key] = 0
      }
    })
  })
}

function resolveVar (input: string, varContext: Record<string, any>) {
  const parsed = parseFunc(input, 'var')
  const replaced = new ReplaceSource(input)

  parsed.forEach(({ start, end, args }) => {
    const varName = args[0]
    const fallback = args[1] || ''
    let varValue = hasOwn(varContext, varName) ? varContext[varName] : fallback
    if (varUseRegExp.test(varValue)) {
      varValue = '' + resolveVar(varValue, varContext)
    } else {
      varValue = '' + formatValue(varValue)
    }
    replaced.replace(start, end - 1, varValue)
  })
  return formatValue(replaced.source())
}

function transformVar (styleObj: Record<string, any>, varKeyPaths: Array<Array<string>>, varContext: Record<string, any>) {
  varKeyPaths.forEach((varKeyPath) => {
    setStyle(styleObj, varKeyPath, ({ target, key, value }) => {
      target[key] = resolveVar(value, varContext)
    })
  })
}

function transformCalc (styleObj: Record<string, any>, calcKeyPaths: Array<Array<string>>, formatter: (value: string, key: string) => number) {
  calcKeyPaths.forEach((calcKeyPath) => {
    setStyle(styleObj, calcKeyPath, ({ target, key, value }) => {
      const parsed = parseFunc(value, 'calc')
      const replaced = new ReplaceSource(value)
      parsed.forEach(({ start, end, args }) => {
        const exp = args[0]
        try {
          const result = new ExpressionParser(exp, (value) => {
            return formatter(value, key)
          }).parse()
          replaced.replace(start, end - 1, '' + result.value)
        } catch (e) {
          error(`calc(${exp}) parse error.`, undefined, e)
        }
      })
      target[key] = formatValue(replaced.source())
    })
  })
}

function transformLineHeight (styleObj: Record<string, any>) {
  let { lineHeight } = styleObj
  if (typeof lineHeight === 'string' && PERCENT_REGEX.test(lineHeight)) {
    const hasFontSize = hasOwn(styleObj, 'fontSize')
    if (!hasFontSize) {
      warn('The fontSize property could not be read correctly, so the default fontSize of 16 will be used as the basis for calculating the lineHeight!')
    }
    const fontSize = hasFontSize ? styleObj.fontSize : DEFAULT_FONT_SIZE
    lineHeight = (parseFloat(lineHeight) / 100) * fontSize
    styleObj.lineHeight = lineHeight
  }
}

interface TransformStyleConfig {
  enableVar?: boolean
  externalVarContext?: Record<string, any>
}

export function useTransformStyle (styleObj: Record<string, any> = {}, { enableVar, externalVarContext }: TransformStyleConfig) {
  const varStyle: Record<string, any> = {}
  const normalStyle: Record<string, any> = {}
  let hasVarDec = false
  let hasVarUse = false
  let hasPercent = false
  let hasCalcUse = false
  const varKeyPaths: Array<Array<string>> = []
  const percentKeyPaths: Array<Array<string>> = []
  const calcKeyPaths: Array<Array<string>> = []
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)
  const setContainerWidth = setWidth
  const setContainerHeight = setHeight

  function varVisitor ({ key, value, keyPath }: VisitorArg) {
    if (keyPath.length === 1) {
      if (varDecRegExp.test(key)) {
        hasVarDec = true
        varStyle[key] = value
      } else {
        // clone对象避免set值时改写到props
        normalStyle[key] = isObject(value) ? diffAndCloneA(value).clone : value
      }
    }
    // 对于var定义中使用的var无需替换值，可以通过resolveVar递归解析出值
    if (!varDecRegExp.test(key) && varUseRegExp.test(value)) {
      hasVarUse = true
      varKeyPaths.push(keyPath.slice())
    }
  }
  // traverse var
  traverseStyle(styleObj, [varVisitor])
  hasVarDec = hasVarDec || !!externalVarContext
  enableVar = enableVar || hasVarDec || hasVarUse
  const enableVarRef = useRef(enableVar)
  if (enableVarRef.current !== enableVar) {
    error('css variable use/declare should be stable in the component lifecycle, or you can set [enable-var] with true.')
  }
  // apply var
  const varContextRef = useRef({})
  if (enableVarRef.current) {
    const varContext = useContext(VarContext)
    const newVarContext = Object.assign({}, varContext, externalVarContext, varStyle)
    // 缓存比较newVarContext是否发生变化
    if (diffAndCloneA(varContextRef.current, newVarContext).diff) {
      varContextRef.current = newVarContext
    }
    transformVar(normalStyle, varKeyPaths, varContextRef.current)
  }

  function calcVisitor ({ value, keyPath }: VisitorArg) {
    if (calcUseRegExp.test(value)) {
      hasCalcUse = true
      calcKeyPaths.push(keyPath.slice())
    }
  }

  function percentVisitor ({ key, value, keyPath }: VisitorArg) {
    if (hasOwn(percentRule, key) && PERCENT_REGEX.test(value)) {
      hasPercent = true
      percentKeyPaths.push(keyPath.slice())
    }
  }

  // traverse calc & percent
  traverseStyle(normalStyle, [percentVisitor, calcVisitor])

  // apply percent
  if (hasPercent) {
    transformPercent(normalStyle, percentKeyPaths, { width, height })
  }

  function calcFormatter (value: string, key: string) {
    if (PERCENT_REGEX.test(value)) {
      if (key === 'width' || key === 'height') {
        error(`calc() can not use % in ${key}.`)
        return 0
      }
      hasPercent = true
      const percentage = parseFloat(value) / 100
      const isHeight = heightPercentRule[key]
      return percentage * (isHeight ? height : width)
    } else {
      const formatted = formatValue(value)
      if (typeof formatted === 'number') {
        return formatted
      } else {
        warn('calc() only support number, px, rpx, % temporarily.')
        return 0
      }
    }
  }
  // apply calc
  if (hasCalcUse) {
    transformCalc(normalStyle, calcKeyPaths, calcFormatter)
  }
  // transform lineHeight
  transformLineHeight(normalStyle)

  return {
    normalStyle,
    hasPercent,
    hasVarDec,
    hasVarUse,
    enableVarRef,
    varContextRef,
    setContainerWidth,
    setContainerHeight
  }
}

export interface VisitorArg {
  target: Record<string, any>
  key: string
  value: any
  keyPath: Array<string>
}

export function traverseStyle (styleObj: Record<string, any>, visitors: Array<(arg: VisitorArg) => void>) {
  const keyPath: Array<string> = []
  function traverse<T extends Record<string, any>> (target: T) {
    if (Array.isArray(target)) {
      target.forEach((value, index) => {
        const key = String(index)
        keyPath.push(key)
        visitors.forEach(visitor => visitor({
          target,
          key,
          value,
          keyPath
        }))
        traverse(value)
        keyPath.pop()
      })
    } else if (isObject(target)) {
      Object.entries(target).forEach(([key, value]) => {
        keyPath.push(key)
        visitors.forEach(visitor => visitor({ target, key, value, keyPath }))
        traverse(value)
        keyPath.pop()
      })
    }
  }
  traverse(styleObj)
}

export function setStyle (styleObj: Record<string, any>, keyPath: Array<string>, setter: (arg: VisitorArg) => void, needClone = false) {
  let target = styleObj
  const firstKey = keyPath[0]
  const lastKey = keyPath[keyPath.length - 1]
  if (needClone) target[firstKey] = diffAndCloneA(target[firstKey]).clone
  for (let i = 0; i < keyPath.length - 1; i++) {
    target = target[keyPath[i]]
    if (!target) return
  }
  setter({
    target,
    key: lastKey,
    value: target[lastKey],
    keyPath
  })
}

export function splitProps<T extends Record<string, any>> (props: T): {
  textProps?: Partial<T>;
  innerProps?: Partial<T>;
} {
  return groupBy(props, (key) => {
    if (TEXT_PROPS_REGEX.test(key)) {
      return 'textProps'
    } else {
      return 'innerProps'
    }
  }) as {
    textProps: Partial<T>;
    innerProps: Partial<T>;
  }
}
