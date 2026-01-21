const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

const MARKER = '[BudgetThing] Fix MCEmojiPicker category icons';

function patchPodfileContents(src) {
  if (src.includes(MARKER)) return src;

  const patchSnippet = `

    # ${MARKER}
    #
    # MCEmojiPicker (used by react-native-emoji-popup) has a layout bug where the
    # emoji category icons can render as thin vertical lines on iOS.
    #
    # Root cause: the pod caches an inset based on an early/incorrect bounds
    # measurement. Making the inset computed (not cached) fixes it.
    begin
      mc_file = File.join(
        installer.sandbox.root,
        'MCEmojiPicker',
        'Sources',
        'MCEmojiPicker',
        'View',
        'Views',
        'EmojiCategoryView',
        'MCTouchableEmojiCategoryView.swift'
      )

      if File.exist?(mc_file)
        contents = File.read(mc_file)
        if contents.include?('private lazy var categoryIconViewInsets')
          replacement = <<~'SWIFT'.strip
            private var categoryIconViewInsets: UIEdgeInsets {
                // The number 0.23 was taken based on the proportion of this element to the width of the EmojiPicker on MacOS.
                let inset = bounds.width * 0.23
                return UIEdgeInsets(top: inset, left: inset, bottom: inset, right: inset)
            }
          SWIFT

          contents = contents.sub(
            /private\s+lazy\s+var\s+categoryIconViewInsets:\s+UIEdgeInsets\s+=\s+\{[\s\S]*?\}\(\)/,
            replacement
          )
          File.chmod(0644, mc_file) rescue nil
          File.write(mc_file, contents)
        end
      end
    rescue => e
      Pod::UI.warn("[Podfile] MCEmojiPicker patch failed: #{e}")
    end
`;

  // Insert immediately after the react_native_post_install(...) call.
  const re = /(react_native_post_install\([\s\S]*?\)\s*\n)/m;
  const match = src.match(re);
  if (!match) {
    throw new Error('Could not locate react_native_post_install(...) in ios/Podfile');
  }

  return src.replace(re, `$1${patchSnippet}`);
}

module.exports = function withMcEmojiPickerCategoryIconsFix(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      const src = fs.readFileSync(podfilePath, 'utf8');
      const next = patchPodfileContents(src);
      if (next !== src) {
        fs.writeFileSync(podfilePath, next);
      }
      return config;
    },
  ]);
};
