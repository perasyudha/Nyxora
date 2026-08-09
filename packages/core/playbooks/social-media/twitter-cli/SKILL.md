---
name: twitter-cli
description: "Twitter/X CLI Automation & Session Manager for Nyxora: post, reply, retweet, follow, search, and autonomous airdrop social task verification."
version: 1.0.0
author: Nyxora Web3 Core Team
license: MIT
platforms: [linux, macos]
prerequisites:
  commands: [node, npx, python3]
metadata:
  nyxora:
    tags: [twitter, x, social-media, airdrop-hunter, twitter-cli, session-auth]
---

# Twitter-CLI — Twitter/X Automation & Airdrop Quest Executor

`twitter-cli` is Nyxora's specialized skill playbook for interacting with Twitter/X. It powers both conversational social media interactions (posting, replying, searching) and autonomous **Web3 Airdrop Social Task Verification** (following project handles, liking/retweeting quest posts, checking role requirements).

---

## Capabilities & Use Cases

- **Autonomous Airdrop Quests**: Auto-follow project Twitter accounts, retweet campaign posts, like announcement tweets.
- **Posting & Engagement**: Publish tweets, reply to threads, quote posts, delete posts.
- **Timeline & Search**: Search tweets by hashtag, topic, or `@handle`, read user timelines and mentions.
- **Social Graph Operations**: Follow, unfollow, block, mute target handles.
- **Session & Auth Management**: Supports both **Official API (OAuth2 via `xurl`)** and **Headless Cookie Session Manager** (`~/.nyxora/auth/twitter_session.json`).

---

## Secret Safety & Privacy Guardrails (MANDATORY)

1. **Never** print, summarize, log, or leak raw `auth_token`, `ct0` cookies, or API keys into chat responses.
2. **Never** ask the user to paste private keys or tokens directly in public chat channels.
3. Keep session storage isolated in `~/.nyxora/auth/twitter_session.json` with file permissions `0600` (`-rw-------`).
4. **Anti-Bot Jitter**: Always apply a randomized execution delay (5s–30s) between sequential write actions (follow, retweet, like) to prevent Twitter rate-limits and shadowbans.

---

## Authentication Modes

### Mode A: Headless Session Cookies (Recommended for Airdrop Hunters)
When operating without berbayar Official API keys, Nyxora uses persistent cookie sessions:
- File path: `~/.nyxora/auth/twitter_session.json`
- Extracted cookies: `auth_token`, `ct0`, `twid`.

Verification check:
```bash
node -e "const fs=require('fs'); console.log(fs.existsSync(process.env.HOME+'/.nyxora/auth/twitter_session.json') ? 'Session Active' : 'No Session');"
```

### Mode B: Official API v2 (`xurl`)
If `xurl` is installed and authorized:
```bash
xurl auth status
xurl whoami
```

---

## Quick Command Reference

| Action | Execution Pattern | Description |
| --- | --- | --- |
| **Post Tweet** | `execute_social_quest(platform='twitter', action='follow', target='@handle')` | Create new post or reply |
| **Retweet Post** | `execute_social_quest(platform='twitter', action='retweet', target='POST_ID')` | Repost target tweet |
| **Like Tweet** | `execute_social_quest(platform='twitter', action='like', target='POST_ID')` | Like target tweet |
| **Follow Account**| `execute_social_quest(platform='twitter', action='follow', target='@handle')` | Follow Twitter profile |
| **Verify Task** | `execute_airdrop_playbook(guideText=...)` | Verify quest compliance |

---

## Airdrop Hunter Workflow Integration

When Nyxora runs an airdrop playbook containing Twitter social steps:

1. **Read Task Requirements**: Identify target handle (e.g., `@Monad_XYZ`) or tweet URL.
2. **Apply Random Jitter**: Delay 5–15 seconds before execution.
3. **Execute Social Action**:
   - If `xurl` available -> call `xurl follow @Monad_XYZ` or `xurl repost TWEET_ID`.
   - If Headless Session available -> call `socialAutomation.executeSocialTask({ platform: 'twitter', action: 'follow', target: '@Monad_XYZ' })`.
4. **Log Result**: Record completion in Playbook DAG state.

---

## Error Handling & Rate Limits

- **HTTP 429 / Rate Limited**: Pause for 15 minutes before retrying write operations.
- **Session Expired**: Notify user to update `~/.nyxora/auth/twitter_session.json` or re-authenticate `xurl`.
- **Target Not Found**: Skip step gracefully and mark as warning in playbook DAG summary.
