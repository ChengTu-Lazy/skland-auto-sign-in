# skland-auto-sign-in

一个用于森空岛的自动签到插件，支持用户绑定 Token 并设置自动签到时间。

## 功能

- 用户可以绑定森空岛 Token。
- 支持手动签到和自动签到。
- 自动签到功能可以设置签到时间。


## 使用

1. 绑定 Token：
   ```
   skland.add <token>
   ```

2. 手动签到：
   ```
   skland.sign
   ```

3. 开启自动签到：
   ```
   skland.auto on
   ```

4. 关闭自动签到：
   ```
   skland.auto off
   ```

5. 查看签到状态：
   ```
   skland.status
   ```

## 配置

可以在插件的配置中设置最大重试次数和自动签到时间。
