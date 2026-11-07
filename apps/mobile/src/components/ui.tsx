import { Children, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { initials } from "../lib/format";
import { radius, space, useTheme, type Theme } from "../lib/theme";

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

type TextVariant = "display" | "title" | "heading" | "body" | "label" | "caption" | "mono";

const TEXT: Record<TextVariant, TextStyle> = {
  display: { fontSize: 32, fontWeight: "700", letterSpacing: -0.8 },
  title: { fontSize: 22, fontWeight: "700", letterSpacing: -0.4 },
  heading: { fontSize: 16, fontWeight: "600", letterSpacing: -0.1 },
  body: { fontSize: 15, lineHeight: 21 },
  label: { fontSize: 13, fontWeight: "600", letterSpacing: 0.1 },
  caption: { fontSize: 12, lineHeight: 16 },
  mono: { fontSize: 12, fontFamily: "Courier" },
};

export function T({
  v = "body",
  muted,
  faint,
  color,
  style,
  children,
  numberOfLines,
}: {
  v?: TextVariant;
  muted?: boolean;
  faint?: boolean;
  color?: string;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
}) {
  const t = useTheme();
  return (
    <Text numberOfLines={numberOfLines} style={[TEXT[v], { color: color ?? (faint ? t.textFaint : muted ? t.textMuted : t.text) }, style]}>
      {children}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function Screen({
  children,
  refreshing,
  onRefresh,
  contentStyle,
  scroll = true,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  scroll?: boolean;
}) {
  const t = useTheme();
  if (!scroll) return <View style={[{ flex: 1, backgroundColor: t.bg }, contentStyle]}>{children}</View>;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={[{ padding: space.lg, paddingBottom: space.xxl * 2, gap: space.lg }, contentStyle]}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={t.textMuted} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style, onPress, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; padded?: boolean }) {
  const t = useTheme();
  const base: ViewStyle = { backgroundColor: t.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border, padding: padded ? space.lg : 0, overflow: "hidden" };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [base, { opacity: pressed ? 0.85 : 1 }, style]}>
      {children}
    </Pressable>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 2 }}>
        <T v="label" muted style={{ textTransform: "uppercase", fontSize: 12, letterSpacing: 0.6 }}>
          {title}
        </T>
        {action}
      </View>
      {children}
    </View>
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border }} />;
}

/** A tappable list row inside a padded={false} Card. */
export function Row({
  title,
  subtitle,
  left,
  right,
  onPress,
  chevron = !!onPress,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
}) {
  const t = useTheme();
  const content = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md, paddingHorizontal: space.lg, minHeight: 56 }}>
      {left}
      <View style={{ flex: 1, gap: 2 }}>
        {typeof title === "string" ? (
          <T v="heading" numberOfLines={1}>
            {title}
          </T>
        ) : (
          title
        )}
        {subtitle ? (
          typeof subtitle === "string" ? (
            <T v="caption" muted numberOfLines={2}>
              {subtitle}
            </T>
          ) : (
            subtitle
          )
        ) : null}
      </View>
      {right}
      {chevron ? <T faint style={{ fontSize: 20, marginLeft: 2 }}>›</T> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ backgroundColor: pressed ? t.surfaceAlt : "transparent" })}>
      {content}
    </Pressable>
  );
}

export function RowList({ children }: { children: ReactNode }) {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <Card padded={false}>
      {items.map((child, i) => (
        <View key={(child as { key?: string }).key ?? i}>
          {i > 0 ? <Divider /> : null}
          {child}
        </View>
      ))}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "positive";

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
  busy,
  small,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  busy?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const colors = buttonColors(t, variant);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        {
          backgroundColor: colors.bg,
          borderColor: colors.border,
          borderWidth: variant === "secondary" ? StyleSheet.hairlineWidth : 0,
          borderRadius: radius.md,
          paddingVertical: small ? 8 : 13,
          paddingHorizontal: small ? 12 : 18,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 8,
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={colors.fg} /> : null}
      <Text style={{ color: colors.fg, fontWeight: "600", fontSize: small ? 13 : 15 }}>{title}</Text>
    </Pressable>
  );
}

function buttonColors(t: Theme, v: ButtonVariant) {
  switch (v) {
    case "primary":
      return { bg: t.accent, fg: t.accentText, border: t.accent };
    case "secondary":
      return { bg: t.surface, fg: t.text, border: t.border };
    case "ghost":
      return { bg: "transparent", fg: t.text, border: "transparent" };
    case "danger":
      return { bg: t.dangerBg, fg: t.danger, border: t.dangerBg };
    case "positive":
      return { bg: t.positive, fg: "#FFFFFF", border: t.positive };
  }
}

export function Field({ label, hint, error, style, ...props }: TextInputProps & { label?: string; hint?: string; error?: string | null }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {label ? <T v="label" muted>{label}</T> : null}
      <TextInput
        placeholderTextColor={t.textFaint}
        {...props}
        style={[
          {
            backgroundColor: t.surface,
            borderColor: error ? t.danger : t.border,
            borderWidth: StyleSheet.hairlineWidth * 2,
            borderRadius: radius.md,
            paddingHorizontal: 14,
            paddingVertical: props.multiline ? 12 : 12,
            fontSize: 15,
            color: t.text,
            minHeight: props.multiline ? 96 : undefined,
            textAlignVertical: props.multiline ? "top" : "center",
          },
          style,
        ]}
      />
      {error ? <T v="caption" color={t.danger}>{error}</T> : hint ? <T v="caption" faint>{hint}</T> : null}
    </View>
  );
}

export function Segmented<V extends string>({ value, options, onChange, small }: { value: V; options: { value: V; label: string }[]; onChange: (v: V) => void; small?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", backgroundColor: t.surfaceAlt, borderRadius: radius.md, padding: 3, gap: 3 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={{ flex: 1, alignItems: "center", paddingVertical: small ? 6 : 8, borderRadius: radius.sm + 1, backgroundColor: active ? t.surface : "transparent" }}
          >
            <Text style={{ fontSize: small ? 12 : 13, fontWeight: active ? "600" : "500", color: active ? t.text : t.textMuted }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ToggleRow({ label, hint, value, onChange, disabled }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md, paddingHorizontal: space.lg }}>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="heading">{label}</T>
        {hint ? <T v="caption" muted>{hint}</T> : null}
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

export type Tone = "neutral" | "positive" | "warning" | "danger" | "info";

export function Pill({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const t = useTheme();
  const map: Record<Tone, [string, string]> = {
    neutral: [t.surfaceAlt, t.textMuted],
    positive: [t.positiveBg, t.positive],
    warning: [t.warningBg, t.warning],
    danger: [t.dangerBg, t.danger],
    info: [t.infoBg, t.info],
  };
  const [bg, fg] = map[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3, alignSelf: "flex-start" }}>
      <Text style={{ color: fg, fontSize: 11, fontWeight: "600", letterSpacing: 0.2 }}>{label}</Text>
    </View>
  );
}

export function Avatar({ name, color, size = 36 }: { name: string; color?: string; size?: number }) {
  const t = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color ?? t.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: color ? "#FFFFFF" : t.textMuted, fontWeight: "700", fontSize: size * 0.36 }}>{initials(name)}</Text>
    </View>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: Tone }) {
  const t = useTheme();
  const color = tone === "positive" ? t.positive : tone === "danger" ? t.danger : tone === "warning" ? t.warning : t.text;
  return (
    <Card style={{ flex: 1, minWidth: 140, gap: 4 }}>
      <T v="caption" muted>{label}</T>
      <T v="title" color={color}>{value}</T>
      {hint ? <T v="caption" faint>{hint}</T> : null}
    </Card>
  );
}

export function Loading({ label }: { label?: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.xxl, gap: space.md, backgroundColor: t.bg }}>
      <ActivityIndicator color={t.textMuted} />
      {label ? <T v="caption" muted>{label}</T> : null}
    </View>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <Card style={{ alignItems: "center", paddingVertical: space.xxl, gap: space.sm }}>
      <T v="heading" style={{ textAlign: "center" }}>{title}</T>
      {body ? <T v="body" muted style={{ textAlign: "center" }}>{body}</T> : null}
      {action ? <View style={{ marginTop: space.sm }}>{action}</View> : null}
    </Card>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: t.dangerBg, borderRadius: radius.md, padding: space.md, gap: space.sm }}>
      <T v="body" color={t.danger}>{message}</T>
      {onRetry ? <Button title="Try again" variant="secondary" small onPress={onRetry} style={{ alignSelf: "flex-start" }} /> : null}
    </View>
  );
}

/** Standard loading / error gate for a useApi result. */
export function Gate<D>({ state, children }: { state: { data: D | null; error: string | null; loading: boolean; reload: () => void }; children: (data: D) => ReactNode }) {
  if (state.data) return <>{children(state.data)}</>;
  if (state.error) {
    return (
      <Screen>
        <ErrorBox message={state.error} onRetry={state.reload} />
      </Screen>
    );
  }
  return <Loading />;
}
