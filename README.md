## hedge_drawio
计划实现hedgedoc与drawio的结合，分阶段实现最终目标。
### 最终目标
1. 全本地docker部署，使用docker-compose一键部署。
2. 在hedgedoc工具栏中添加功能，支持插入drawio图形，自动使用drawio编辑器编辑，保存后在hedgedoc中正确显示。
3. 插入后的drawio图形，可以再次编辑，点击直接在drawio编辑器修改，保存后自动在hedgedoc中更新。
4. 支持对hedgedoc的文档打包下载，包含原始drawio文件并和渲染导出的图片，导出的markdown正常显示所有内容。
5. 支持对drawio导出的格式进行配置，支持PNG（优先支持）和SVG，支持对导出格式的选项进行配置。（可以采用配置文件在docker启动时配置）
6. 支持所有的数据持久化保存，包括hedgedoc的文档，drawio的文件，drawio的配置文件等。
7. 支持对drawio的文件进行管理（原始文件和渲染后的文件），单独的管理功能/页面，支持统计清理孤立文件及直接下载文件。
### 项目结构
drawio/ 为drawio源代码
hedgedoc/ 为hedgedoc源代码
### 第一阶段目标
1. 全部使用官方镜像完成最基本的搭建，无需任何集成工作。生成并固化docker-compose.yml文件。
2. 使用git管理本项目，drawio和hedgedoc为git submodule。
### 第二阶段目标
1. 全部使用编译镜像完成最基本的搭建，无需任何集成工作。
2. 生成固化镜像编译脚本。
### 第三阶段目标
1. 集成hedgedoc的drawio插入功能，支持二次修改。
2. 支持以PNG格式插入drawio图形。
### 第四阶段目标
1. 支持以SVG格式插入drawio图形。
2. 支持配置drawio的导出格式，选项配置。
### 第五阶段目标
1. 支持hedgedoc的文档打包下载，包含原始drawio文件并和渲染导出的图片，导出的markdown正常显示所有内容。
2. 支持所有的数据持久化保存，包括hedgedoc的文档，drawio的文件，drawio的配置文件等。
### 第六阶段目标
1. 支持对drawio的文件进行管理（原始文件和渲染后的文件），单独的管理功能/页面，支持统计清理孤立文件及直接下载文件。
### 测试要求
每次子任务完成后，必须进行的测试用例。
1. 任务栏功能测试
    1.1. 新建文档
    1.2. 输入“测试数据testabc”
    1.3. F5刷新页面
    1.4. 切换到双栏编辑模式。
    1.5. 确认“测试数据testabc”未丢失
    1.6. 确认编辑器的工具栏正常显示，选中“测试数据testabc”，点击加粗，功能正常



