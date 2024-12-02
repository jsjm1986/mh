const CONFIG = {
    // Deepseek API配置
    DEEPSEEK_API_KEY: 'YOUR_DEEPSEEK_API_KEY', // 请替换为您的API密钥
    DEEPSEEK_API_URL: 'https://api.deepseek.com/v1/chat/completions', // 替换为实际的API端点

    // 提示词模板
    PROMPTS: {
        STORY_GENERATION: "基于以下历史背景，创作一个引人入胜的故事：",
        SCRIPT_CREATION: "基于以下故事，创作一个戏剧性的剧本：",
        STORYBOARD_CREATION: "基于以下剧本，创建详细的分镜脚本：",
    },

    // 生成参数
    GENERATION_PARAMS: {
        temperature: 0.9,
        max_tokens: 4000,
        top_p: 0.9,
        frequency_penalty: 0.5,
        presence_penalty: 0.5
    }
};
