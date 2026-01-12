import React from 'react';
import {
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
      {...rest}
      allowFontScaling={false}
      maxFontSizeMultiplier={1}
    />
  );
});
