import {
  LayoutDashboard,
  Clapperboard,
  Users,
  Shirt,
  MapPin,
  SlidersHorizontal,
  Settings,
  Activity,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
}

export const mainNav: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Shoots", href: "/shoots", icon: Clapperboard },
];

export const settingsNav: NavItem[] = [
  { title: "Usage", href: "/usage", icon: Activity },
  { title: "Settings", href: "/settings", icon: Settings },
];

export const libraryNav: NavItem[] = [
  { title: "Models", href: "/models", icon: Users },
  { title: "Wardrobe", href: "/outfits", icon: Shirt },
  { title: "Locations", href: "/locations", icon: MapPin },
  { title: "Presets", href: "/presets", icon: SlidersHorizontal },
];
