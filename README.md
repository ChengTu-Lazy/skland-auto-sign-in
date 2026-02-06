# skland-auto-sign-in

一个用于森空岛的自动签到Koishi插件，支持用户绑定 Token 并设置自动签到时间。    
> **参考项目：https://gitee.com/FancyCabbage/skyland-auto-sign** 
 
> **💡部分功能使用Python,可能需要手动安装**  

## 功能

- 用户可以绑定森空岛 Token。
- 支持手动签到和自动签到。
- 自动签到功能可以设置签到时间。


## Token 获取教程

1. 登录 [森空岛](https://www.skland.com/)。
2. 访问链接：[https://web-api.skland.com/account/info/hg](https://web-api.skland.com/account/info/hg)。
3. 在返回的 JSON 数据中找到 `content` 字段，形如 `{"content":"XXX"}`，其中的 `XXX` 即为所需的 Token。


## 使用

1. 绑定 Token（**请私聊 Bot**）：
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
