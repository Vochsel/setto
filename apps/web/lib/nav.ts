import {
  LayoutDashboard,
  Clapperboard,
  Megaphone,
  Film,
  ListChecks,
  Images,
  Heart,
  Users,
  Shirt,
  MapPin,
  SlidersHorizontal,
  Settings,
  Activity,
  ShoppingBag,
  Send,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
}

export const mainNav: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Flows", href: "/flows", icon: Workflow },
  { title: "Shoots", href: "/shoots", icon: Clapperboard },
  { title: "Campaigns", href: "/campaigns", icon: Megaphone },
  { title: "Videos", href: "/videos", icon: Film },
  { title: "Gallery", href: "/gallery", icon: Images },
  { title: "Queue", href: "/queue", icon: ListChecks },
  { title: "Favorites", href: "/favorites", icon: Heart },
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

export const commerceNav: NavItem[] = [
  { title: "Store", href: "/store", icon: ShoppingBag },
  { title: "Social", href: "/social", icon: Send },
];
