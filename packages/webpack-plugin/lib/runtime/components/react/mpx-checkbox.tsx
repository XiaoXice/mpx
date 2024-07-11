/**
 * ✔ value
 * ✔ disabled
 * ✔ checked
 * ✔ color
 */
import {
  JSX,
  useRef,
  useState,
  forwardRef,
  useEffect,
  ReactNode,
  useContext
} from 'react'
import {
  View,
  Text,
  StyleSheet,
  StyleProp,
  ViewStyle,
  NativeSyntheticEvent,
  TextStyle
} from 'react-native'
import useInnerProps, { getCustomEvent } from './getInnerListeners'
import useNodesRef, { HandlerRef } from './useNodesRef'
import Icon from './mpx-icon'
import { every, extractTextStyle, isText } from './utils'
import { CheckboxGroupContext } from './context'

interface Selection {
  value?: string
  checked?: boolean
}

export interface CheckboxProps extends Selection {
  disabled?: boolean
  color?: string
  style?: StyleProp<ViewStyle>
  groupValue?: Array<string>
  'enable-offset'?: boolean
  children: ReactNode
  bindtap?: (evt: NativeSyntheticEvent<TouchEvent> | unknown) => void
  catchtap?: (evt: NativeSyntheticEvent<TouchEvent> | unknown) => void
  _onChange?: (
    evt: NativeSyntheticEvent<TouchEvent> | unknown,
    selection: Selection
  ) => void
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    borderColor: '#D1D1D1',
    borderWidth: 1,
    borderRadius: 3,
    backgroundColor: '#ffffff',
    marginRight: 5
  },
  wrapperDisabled: {
    backgroundColor: '#E1E1E1'
  },
  icon: {
    opacity: 0
  },
  iconChecked: {
    opacity: 1
  }
})

const Checkbox = forwardRef<HandlerRef<View, CheckboxProps>, CheckboxProps>(
  (props, ref): JSX.Element => {
    const {
      value,
      disabled = false,
      checked = false,
      color = '#09BB07',
      style = [],
      'enable-offset': enableOffset,
      children,
      bindtap,
      catchtap,
    } = props

    const layoutRef = useRef({})

    const [isChecked, setIsChecked] = useState<boolean>(!!checked)

    const textStyle = extractTextStyle(style)

    const { groupValue, notifyChange } = useContext(CheckboxGroupContext)

    const defaultStyle = StyleSheet.flatten([
      styles.wrapper,
      disabled && styles.wrapperDisabled,
      style
    ])

    const onChange = (evt: NativeSyntheticEvent<TouchEvent>) => {
      if (disabled) return
      const checked = !isChecked
      setIsChecked(checked)
      if (groupValue) {
        groupValue[value].checked = checked
      }
      notifyChange && notifyChange(evt)
    }

    const onTap = (evt: NativeSyntheticEvent<TouchEvent>) => {
      if (disabled) return
      bindtap && bindtap(getCustomEvent('tap', evt, { layoutRef }, props))
      onChange(evt)
    }

    const catchTap = (evt: NativeSyntheticEvent<TouchEvent>) => {
      if (disabled) return
      catchtap && catchtap(getCustomEvent('tap', evt, { layoutRef }, props))
      onChange(evt)
    }

    const { nodeRef } = useNodesRef(props, ref, {
      defaultStyle,
      change: onChange
    })

    const onLayout = () => {
      nodeRef.current?.measure(
        (
          x: number,
          y: number,
          width: number,
          height: number,
          offsetLeft: number,
          offsetTop: number
        ) => {
          layoutRef.current = { x, y, width, height, offsetLeft, offsetTop }
        }
      )
    }

    const wrapChildren = (
      children: ReactNode,
      textStyle?: StyleProp<TextStyle>
    ) => {
      if (every(children, (child) => isText(child))) {
        children = [
          <Text key='checkboxTextWrap' style={textStyle}>
            {children}
          </Text>
        ]
      } else {
        if (textStyle)
          console.warn(
            'Text style will be ignored unless every child of the Checkbox is Text node!'
          )
      }

      return children
    }

    const innerProps = useInnerProps(
      props,
      {
        ref: nodeRef,
        style: [styles.container],
        bindtap: onTap,
        catchtap: catchTap,
        ...(enableOffset ? { onLayout } : {})
      },
      ['enable-offset'],
      {
        layoutRef
      }
    )

    useEffect(() => {
      if (groupValue) {
        groupValue[value] = {
          checked: checked,
          setValue: setIsChecked
        }
      }
      return () => {
        if (groupValue) {
          delete groupValue[value]
        }
      }
    }, [])

    useEffect(() => {
      if (checked !== isChecked) {
        setIsChecked(checked)
        if (groupValue) {
          groupValue[value].checked = checked
        }
      }
    }, [checked])

    return (
      <View {...innerProps}>
        <View style={defaultStyle}>
          <Icon
            type='success_no_circle'
            size={18}
            color={disabled ? '#ADADAD' : color}
            style={isChecked ? styles.iconChecked : styles.icon}
          />
        </View>
        {wrapChildren(children, textStyle)}
      </View>
    )
  }
)

Checkbox.displayName = 'mpx-checkbox'

export default Checkbox
