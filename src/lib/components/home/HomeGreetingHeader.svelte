<script lang="ts">
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { getSessionContext } from '$lib/stores/session.svelte';
  import { formatInstallNumber } from '$lib/browser/app-stats';

  const localeStore = getLocaleContext();
  const sessionStore = getSessionContext();
  const isEn = $derived(localeStore.current === 'en');

  const formattedCount = $derived(formatInstallNumber(1291, localeStore.current));

  let failedAvatarKey = $state<string | null>(null);
  const avatarUrl = $derived(sessionStore.value.user?.avatarUrl?.trim() || null);
  const avatarKey = $derived(`${sessionStore.value.user?.id ?? ''}:${avatarUrl ?? ''}`);
  const userAvatar = $derived(failedAvatarKey === avatarKey ? null : avatarUrl);

  const displayName = $derived.by(() => {
    const user = sessionStore.value.user;
    if (user?.displayName && user.displayName.trim()) return user.displayName.trim();
    return isEn ? 'Dear Practitioner' : 'Quý Phật Tử';
  });

</script>

<header class="home-greeting-header" aria-label={isEn ? 'Home Header' : 'Đầu trang chủ'}>
  <div class="greeting-top-row">
    <div class="greeting-user">
      <div class="greeting-avatar" aria-hidden="true">
        {#if userAvatar}
          <img
            src={userAvatar}
            alt=""
            class="avatar-photo"
            referrerpolicy="no-referrer"
            onerror={() => { failedAvatarKey = avatarKey; }}
          />
        {:else if sessionStore.value.authenticated}
          <span class="avatar-initial">{displayName.slice(0, 1).toLocaleUpperCase()}</span>
        {:else}
          <span class="avatar-lotus">🪷</span>
        {/if}
      </div>
      <div class="greeting-text">
        <span class="greeting-hello">{isEn ? 'Welcome' : 'Xin chào'},</span>
        <h1 class="greeting-name">{displayName}</h1>
      </div>
    </div>

    <div class="greeting-actions">
      <a
        href="/ca-nhan"
        class="greeting-btn"
        aria-label={isEn ? 'User Profile & Settings' : 'Trang cá nhân & Cài đặt'}
        title={isEn ? 'Settings' : 'Cài đặt'}
      >
        <svg viewBox="0 0 24 24" class="greeting-svg" aria-hidden="true">
          <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" fill="none"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" stroke-width="2" fill="none"/>
        </svg>
      </a>
    </div>
  </div>

  <!-- Huy hiệu toàn cầu chuẩn yêu cầu -->
  <div class="global-presence-pill" role="status">
    <span class="presence-globe" aria-hidden="true">🌍</span>
    <span class="presence-content">
      {#if isEn}
        Present in <strong>178 countries</strong> • <strong>{formattedCount}+</strong> people installed and practicing daily
      {:else}
        Ứng dụng hiện diện tại <strong>178 quốc gia</strong> • <strong>{formattedCount}+</strong> người đã cài đặt và đang sử dụng để tu tập hàng ngày
      {/if}
    </span>
  </div>
</header>

<style>
  .home-greeting-header {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    margin-bottom: 2px;
  }

  .greeting-top-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .greeting-user {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  
  .avatar-photo {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
  }

  .greeting-avatar {
    width: 44px;
    height: 44px;
    min-width: 44px;
    border-radius: 50%;
    background: linear-gradient(135deg, color-mix(in srgb, var(--gold) 25%, var(--card)), var(--card));
    border: 1.5px solid var(--gold);
    display: grid;
    place-items: center;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.08);
  }

  .avatar-lotus {
    font-size: 22px;
    line-height: 1;
    transform: translateY(-1px);
  }

  .avatar-initial {
    color: var(--gold);
    font-weight: 700;
  }

  .greeting-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .greeting-hello {
    font-size: var(--font-size-meta);
    font-weight: 600;
    color: var(--muted);
    letter-spacing: 0.02em;
    line-height: 1.2;
  }

  .greeting-name {
    margin: 0;
    font-size: var(--font-size-card-title);
    font-weight: 800;
    color: var(--text);
    line-height: 1.25;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    letter-spacing: -0.01em;
  }

  .greeting-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .greeting-btn {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: 1.5px solid var(--border);
    background: var(--card);
    color: var(--text2);
    display: grid;
    place-items: center;
    cursor: pointer;
    text-decoration: none;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
    transition: transform 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }

  .greeting-btn:hover {
    border-color: var(--gold);
    color: var(--gold);
    transform: scale(1.05);
  }

  .greeting-btn:active {
    transform: scale(0.95);
  }

  .greeting-svg {
    width: 20px;
    height: 20px;
  }

  /* Huy hiệu 178 quốc gia */
  .global-presence-pill {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0;
    border-radius: 14px;
    background: transparent;
    border: 0;
    color: var(--text2);
    font-size: var(--font-size-label);
    line-height: 1.45;
    box-shadow: none;
  }

  .presence-globe {
    font-size: 15px;
    line-height: 1;
    flex-shrink: 0;
  }

  .presence-content {
    flex: 1;
    min-width: 0;
    color: var(--text);
  }

  .presence-content strong {
    color: var(--gold);
    font-weight: 800;
  }

  @keyframes pill-glow {
    from {
      border-color: color-mix(in srgb, var(--gold) 30%, var(--border));
    }
    to {
      border-color: color-mix(in srgb, var(--gold) 65%, var(--border));
    }
  }

  @media (max-width: 480px) {
    .greeting-name {
      font-size: var(--font-size-card-title);
    }
    .greeting-avatar {
      width: 40px;
      height: 40px;
      min-width: 40px;
    }
    .avatar-lotus {
      font-size: 20px;
    }
    .global-presence-pill {
      font-size: var(--font-size-label);
      padding: 7px 12px;
      gap: 6px;
    }
  }
</style>
