# 开发与发布

## 本地开发

```bash
npm install
npm run build     # core -> handwriting -> vue
npm test          # core 的 16 组用例（node:test）
npm run dev       # playground，http://localhost:5180
```

改完包源码要重新 `npm run build`，playground 用的是各包的 `dist`。

## 发布到 npm

四个包有依赖顺序，用脚本按序发布：

```bash
npm run publish:all
```

### 如果账号开了发布 2FA

`npm publish` 会报 `403 Two-factor authentication ... is required`。
把验证器上的六位码带上：

```bash
NPM_OTP=123456 npm run publish:all
```

### 如果用 access token（CI 场景）

在 npm 上创建 **Granular Access Token** 并勾选 *bypass 2FA*，然后：

```bash
echo '//registry.npmjs.org/:_authToken=npm_xxxxx' > ~/.npmrc
npm run publish:all
```

### 预演

```bash
npm run publish:all -- --dry-run
```

## 版本号

四个包版本保持一致：

```bash
npm version 0.1.1 --workspaces --no-git-tag-version
```

## 手写模型

`packages/model/hz.hzmodel`（7.5MB）在仓库里只保留一份，playground 的
`predev` / `prebuild` 会复制到 `playground/public/hw/`。
如果文件缺失：

```bash
curl -sSL -o packages/model/hz.hzmodel \
  https://cdn.jsdelivr.net/gh/peterolson/hanscribe@v0.1.1/test/test.hzmodel
```
