import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = { children: ReactNode };
type State = { hasError: boolean; resetKey: number };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, resetKey: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (__DEV__) console.error('RAID runtime boundary', error, info.componentStack);
  }

  private recover = () => {
    this.setState((current) => ({ hasError: false, resetKey: current.resetKey + 1 }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.root} accessibilityRole="alert">
          <View style={styles.card}>
            <View style={styles.icon}>
              <Ionicons name="refresh-circle-outline" size={34} color="#D5AA88" />
            </View>
            <Text style={styles.title}>تمت حماية جلسة RAID</Text>
            <Text style={styles.body}>
              حدث خطأ مؤقت في واجهة التطبيق. أوقف RAID الشاشة المتأثرة بدل ترك التطبيق على شاشة فارغة.
            </Text>
            <Pressable onPress={this.recover} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]} accessibilityRole="button" accessibilityLabel="إعادة تشغيل واجهة RAID">
              <Ionicons name="reload" size={18} color="#FFFFFF" />
              <Text style={styles.buttonText}>إعادة تشغيل الواجهة</Text>
            </Pressable>
            <Text style={styles.hint}>لن يتم حذف السجل أو المفضلة أو إعداداتك.</Text>
          </View>
        </View>
      );
    }

    return <View key={this.state.resetKey} style={styles.content}>{this.props.children}</View>;
  }
}

const styles = StyleSheet.create({
  content: { flex: 1 },
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    backgroundColor: '#1D201F',
  },
  card: {
    width: '100%',
    maxWidth: 430,
    borderRadius: 28,
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#292C2A',
    borderWidth: 1,
    borderColor: '#484C48',
  },
  icon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#373A37',
    marginBottom: 14,
  },
  title: {
    color: '#FFF9F2',
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  body: {
    color: '#D3CBC4',
    fontSize: 13,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 10,
  },
  button: {
    width: '100%',
    minHeight: 50,
    borderRadius: 16,
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#9A6F53',
  },
  buttonPressed: { opacity: 0.84, transform: [{ scale: 0.99 }] },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  hint: { color: '#9F9892', fontSize: 10.5, textAlign: 'center', marginTop: 11 },
});
