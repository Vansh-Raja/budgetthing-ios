import React from 'react';
import {
  Platform,
  Text as RNText,
  TextProps as RNTextProps,
  TextInput as RNTextInput,
  TextInputProps as RNTextInputProps,
} from 'react-native';

export type TextProps = RNTextProps;
export type TextInputProps = RNTextInputProps;

type TextRef = React.ElementRef<typeof RNText>;
type TextInputRef = React.ElementRef<typeof RNTextInput>;

/**
 * Text that ignores Dynamic Type / font scaling.
 */
export const Text = React.forwardRef<TextRef, RNTextProps>(function LockedText(props, ref) {
  const { allowFontScaling: _allowFontScaling, maxFontSizeMultiplier: _maxFontSizeMultiplier, ...rest } = props;

  return (
    <RNText
      ref={ref}
      {...rest}
      allowFontScaling={false}
      maxFontSizeMultiplier={1}
    />
  );
});

/**
 * TextInput that ignores Dynamic Type / font scaling.
 */
export const TextInput = React.forwardRef<TextInputRef, RNTextInputProps>(function LockedTextInput(props, ref) {
  const { allowFontScaling: _allowFontScaling, maxFontSizeMultiplier: _maxFontSizeMultiplier, ...rest } = props;

  return (
    <RNTextInput
      ref={ref}
      {...androidInputDefaults}
      {...rest}
      style={Platform.OS === 'android' ? [androidInputReset, rest.style] : rest.style}
      allowFontScaling={false}
      maxFontSizeMultiplier={1}
    />
  );
});

// Android draws a Material underline and extra vertical padding on every input and
// tints the cursor with the theme's primary color; match iOS instead.
const androidInputDefaults: Partial<RNTextInputProps> =
  Platform.OS === 'android'
    ? { underlineColorAndroid: 'transparent', cursorColor: '#FF9500', selectionColor: 'rgba(255, 149, 0, 0.4)', selectionHandleColor: '#FF9500' }
    : {};
const androidInputReset = { paddingVertical: 0 };
