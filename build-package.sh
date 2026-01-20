#!/bin/bash
cd /Users/yusw/Documents/workspace_cursor/jira-gitlab-helper
npm run compile
npx vsce package --no-yarn
ls -lh jira-gitlab-helper-*.vsix | tail -5
