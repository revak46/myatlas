import { Tabs } from "expo-router";

export default function TabLayout() {
  // Single-tab for now — add Trips / Stats later
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: "none" } }}>
      <Tabs.Screen name="index" options={{ title: "Home" }} />
    </Tabs>
  );
}
