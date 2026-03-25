# MyAtlas-Mobile — Vision Integration Guide

## 1. Copy files into MyAtlas-Mobile

```bash
cp ~/MyAtlas/mobile-vision/config.ts         ~/myatlas/MyAtlas-Mobile/config.ts
cp ~/MyAtlas/mobile-vision/utils/vision.ts   ~/myatlas/MyAtlas-Mobile/utils/vision.ts
cp ~/MyAtlas/mobile-vision/components/ImageInput.tsx    ~/myatlas/MyAtlas-Mobile/components/ImageInput.tsx
cp ~/MyAtlas/mobile-vision/components/SignalConfirm.tsx ~/myatlas/MyAtlas-Mobile/components/SignalConfirm.tsx
```

## 2. Add config.ts to .gitignore (API key protection)

```bash
echo "config.ts" >> ~/myatlas/MyAtlas-Mobile/.gitignore
```

## 3. Install expo-image-picker

```bash
cd ~/myatlas/MyAtlas-Mobile
npx expo install expo-image-picker
```

## 4. Add API key to config.ts

Edit `~/myatlas/MyAtlas-Mobile/config.ts`:
```ts
ANTHROPIC_API_KEY: 'sk-ant-YOUR_ACTUAL_KEY_HERE',
```
Get your key at: https://console.anthropic.com/

## 5. Integrate into App.tsx

Add these imports at the top:
```tsx
import ImageInput from './components/ImageInput';
import SignalConfirm from './components/SignalConfirm';
import { VisionSignal } from './utils/vision';
```

Add state inside your main component:
```tsx
const [visionSignal, setVisionSignal] = useState<VisionSignal | null>(null);
const [visionImageUri, setVisionImageUri] = useState<string | null>(null);
const [showConfirm, setShowConfirm] = useState(false);

const handleSignalReady = (signal: VisionSignal, imageUri: string) => {
  setVisionSignal(signal);
  setVisionImageUri(imageUri);
  setShowConfirm(true);
};

const handleConfirm = (signal: VisionSignal) => {
  setShowConfirm(false);
  // Save to storage — add to your existing saveEntry() or similar
  // Example:
  // saveEntry({
  //   source: 'helm-vision',
  //   pillar: signal.pillar,
  //   signal: signal.signal,
  //   details: signal.details,
  //   tags: signal.tags,
  //   action_needed: signal.action_needed,
  //   created_at: new Date().toISOString(),
  // });
};
```

Place the camera button next to your text input:
```tsx
{/* Input row */}
<View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
  <TextInput
    style={{ flex: 1 }}
    // ... your existing text input props
  />
  <ImageInput onSignalReady={handleSignalReady} />
</View>

{/* Confirmation modal */}
<SignalConfirm
  visible={showConfirm}
  signal={visionSignal}
  imageUri={visionImageUri}
  onConfirm={handleConfirm}
  onDismiss={() => setShowConfirm(false)}
/>
```

## 6. Test on web preview first

```bash
cd ~/myatlas/MyAtlas-Mobile
npx expo start --web
```

Note: Camera won't work on web — library picker will. Full camera test requires native build (EAS).
```
