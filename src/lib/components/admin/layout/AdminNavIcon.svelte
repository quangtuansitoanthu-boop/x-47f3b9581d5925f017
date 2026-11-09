<script lang="ts">
  import {
    BookOpen,
    ChartNoAxesColumnIncreasing,
    Headphones,
    HeartHandshake,
    House,
    LayoutDashboard,
    Settings,
    UserRoundCog,
    UsersRound,
  } from '@lucide/svelte';

  interface Props { name: 'dashboard' | 'analytics' | 'community' | 'book' | 'talk' | 'practice' | 'members' | 'settings' | 'home'; }
  let { name }: Props = $props();

  const icons = {
    dashboard: LayoutDashboard,
    analytics: ChartNoAxesColumnIncreasing,
    community: UsersRound,
    book: BookOpen,
    talk: Headphones,
    practice: HeartHandshake,
    members: UserRoundCog,
    settings: Settings,
    home: House,
  };
  const Icon = $derived(icons[name]);
</script>

<Icon aria-hidden="true" size={19} strokeWidth={1.8} />
