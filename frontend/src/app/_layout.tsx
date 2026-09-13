import 'react-native-gesture-handler';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ink } from '@/theme/ref';
import { useRefFonts } from '@/theme/refFonts';

export default function RootLayout() {
  // 参考原型用 Noto Serif SC / Noto Sans SC（next/font）；RN 侧按字重打包成独立 family。
  // 字体加载完成后组件会重渲染，文字自动换成打包字体（无需阻塞首屏）。
  const fontsLoaded = useRefFonts();

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <View style={styles.root} testID={fontsLoaded ? 'fonts-ready' : 'fonts-loading'}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: ink[950] },
              animation: 'fade',
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="setup" />
            <Stack.Screen name="battle" />
            <Stack.Screen name="cards" />
            <Stack.Screen name="card/[cardId]" />
            <Stack.Screen name="result" />
            <Stack.Screen name="ai-lab" />
          </Stack>
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: ink[950],
  },
});
