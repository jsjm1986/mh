// 状态管理
let isLoading = false;
let currentStory = '';
let currentScript = '';
let historyBackground = '';
let characters = [];
let apiKey = null; // 全局变量，存储API密钥

// 工具函数：状态管理
function showLoading(message = '处理中...') {
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'loadingIndicator';
    loadingDiv.className = 'loading-indicator';
    loadingDiv.innerHTML = `
        <div class="loading-content">
            <div class="spinner"></div>
            <p>${message}</p>
        </div>
    `;
    document.body.appendChild(loadingDiv);
}

function hideLoading() {
    const loadingDiv = document.getElementById('loadingIndicator');
    if (loadingDiv) {
        loadingDiv.remove();
    }
}

function showError(message) {
    hideLoading();
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `
        <div class="error-content">
            <i class="fas fa-exclamation-circle"></i>
            <p>${message}</p>
        </div>
    `;
    document.body.appendChild(errorDiv);
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}

function showSuccess(message) {
    hideLoading();
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.innerHTML = `
        <div class="success-content">
            <i class="fas fa-check-circle"></i>
            <p>${message}</p>
        </div>
    `;
    document.body.appendChild(successDiv);
    setTimeout(() => {
        successDiv.remove();
    }, 3000);
}

// 设置加载状态
function setLoading(elementId, loading) {
    const element = document.getElementById(elementId);
    if (element && loading) {
        element.innerHTML = '<div class="loading">生成中，请稍候...</div>';
    }
}

// 检查是否已经登录
window.onload = function() {
    checkApiKey();
};

// 验证API密钥
async function verifyApiKey() {
    const apiKeyInput = document.getElementById('apiKey').value.trim();
    if (!apiKeyInput) {
        showError('请输入API密钥');
        return;
    }

    try {
        // 保存API密钥到localStorage
        localStorage.setItem('apiKey', apiKeyInput);
        apiKey = apiKeyInput; // 更新全局变量

        // 显示主界面
        document.getElementById('loginContainer').style.display = 'none';
        document.getElementById('mainContainer').style.display = 'block';
        
        showSuccess('API密钥设置成功！');
    } catch (error) {
        console.error('保存API密钥时出错:', error);
        showError('设置API密钥失败，请重试');
    }
}

// 检查是否已经保存了API密钥
function checkApiKey() {
    const savedApiKey = localStorage.getItem('apiKey');
    if (savedApiKey) {
        apiKey = savedApiKey;
        document.getElementById('loginContainer').style.display = 'none';
        document.getElementById('mainContainer').style.display = 'block';
    }
}

// API密钥验证
async function verifyAndLogin(apiKey) {
    try {
        // 测试API密钥是否有效
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    {
                        role: "user",
                        content: "测试消息"
                    }
                ]
            })
        });

        if (response.ok) {
            // 保存API密钥到本地存储
            localStorage.setItem('deepseekApiKey', apiKey);
            // 显示主界面
            document.getElementById('loginContainer').style.display = 'none';
            document.getElementById('mainContainer').style.display = 'block';
        } else {
            throw new Error('API密钥无效');
        }
    } catch (error) {
        showError('API密钥验证失败，请确认密钥是否正确');
        localStorage.removeItem('deepseekApiKey');
    }
}

// API调用函数
async function callDeepseekAPI(prompt, systemPrompt = '', targetElementId = 'generatedStory') {
    const maxRetries = 3;
    let retryCount = 0;
    let retryDelay = 5000;

    while (retryCount < maxRetries) {
        try {
            const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: "deepseek-chat",
                    messages: [
                        {
                            role: "system",
                            content: systemPrompt
                        },
                        {
                            role: "user",
                            content: prompt + "\n\n请确保生成完整的内容，不要中途截断。如果内容较长，请分多次输出，每次都要完整。"
                        }
                    ],
                    temperature: 0.8,
                    max_tokens: 4000,
                    top_p: 0.95,
                    frequency_penalty: 0.3,
                    presence_penalty: 0.3,
                    stream: true
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                if (response.status === 401) {
                    localStorage.removeItem('deepseekApiKey');
                    location.reload();
                    throw new Error('API密钥已失效，请重新登录');
                } else if (response.status === 429) {
                    const waitTime = Math.min(60 * 60 * 1000, retryDelay);
                    const minutes = Math.ceil(waitTime / 60000);
                    
                    const targetElement = document.getElementById(targetElementId);
                    if (targetElement) {
                        const notice = document.createElement('div');
                        notice.className = 'rate-limit-notice';
                        notice.innerHTML = `API调用频率限制，正在等待${minutes}分钟后重试...<br>已重试${retryCount + 1}/${maxRetries}次`;
                        targetElement.appendChild(notice);
                    }

                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    retryDelay *= 2;
                    retryCount++;
                    continue;
                }
                throw new Error(errorData.error?.message || '未知错误');
            }

            const reader = response.body.getReader();
            let fullContent = '';
            const decoder = new TextDecoder();

            while (true) {
                const {value, done} = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value);
                try {
                    const lines = chunk.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const jsonStr = line.slice(6);
                            if (jsonStr.trim() === '[DONE]') continue;
                            
                            const jsonData = JSON.parse(jsonStr);
                            const content = jsonData.choices[0].delta.content || '';
                            fullContent += content;
                            
                            const targetElement = document.getElementById(targetElementId);
                            if (targetElement) {
                                let lastStoryPart = targetElement.querySelector('.story-part:last-child');
                                if (!lastStoryPart) {
                                    lastStoryPart = document.createElement('div');
                                    lastStoryPart.className = 'story-part';
                                    targetElement.appendChild(lastStoryPart);
                                }
                                lastStoryPart.innerHTML = fullContent.replace(/\n/g, '<br>');
                                targetElement.scrollTop = targetElement.scrollHeight;
                            }
                        }
                    }
                } catch (e) {
                    console.error('解析响应时出错:', e);
                }
            }

            return fullContent;
        } catch (error) {
            console.error('API调用错误:', error);
            retryCount++;
            
            if (retryCount >= maxRetries) {
                throw new Error(`多次重试后仍然失败: ${error.message}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            retryDelay *= 2;
        }
    }
}

// 分段生成故事
async function generateStoryInParts(prompt, systemPrompt) {
    const parts = [
        {
            title: "故事梗概和第一章",
            prompt: `${prompt}\n请只输出故事梗概和第一章的内容。`,
            selector: "generatedStory"
        },
        {
            title: "第二章和第三章",
            prompt: `继续上文的故事，请输出第二章和第三章的内容。\n原始设定：\n${prompt}`,
            selector: "generatedStory"
        },
        {
            title: "第四章和第五章",
            prompt: `继续上文的故事，请输出第四章和第五章的内容，并在最后总结整个故事的关键视觉场景和情感转折点。\n原始设定：\n${prompt}`,
            selector: "generatedStory"
        }
    ];

    let fullStory = '';
    const outputElement = document.getElementById('generatedStory');
    outputElement.innerHTML = ''; // 清空之前的内容

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        try {
            // 显示正在生成的部分
            const noticeDiv = document.createElement('div');
            noticeDiv.className = 'generating-notice';
            noticeDiv.textContent = `正在生成${part.title}...`;
            outputElement.appendChild(noticeDiv);
            
            const content = await callDeepseekAPI(part.prompt, systemPrompt, part.selector);
            
            // 移除生成提示
            noticeDiv.remove();
            
            // 添加新内容
            fullStory += (i > 0 ? '\n\n' : '') + content;
            
            // 创建新的内容容器
            const contentDiv = document.createElement('div');
            contentDiv.className = 'story-part';
            contentDiv.innerHTML = content.replace(/\n/g, '<br>');
            
            // 添加到输出元素
            outputElement.appendChild(contentDiv);
            
            // 滚动到底部
            outputElement.scrollTop = outputElement.scrollHeight;
        } catch (error) {
            console.error(`生成${part.title}时出错:`, error);
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-notice';
            errorDiv.textContent = `生成${part.title}时出错: ${error.message}`;
            outputElement.appendChild(errorDiv);
        }
    }

    return fullStory;
}

// 保存历史背景
function saveHistoryBackground() {
    const background = document.getElementById('historyInput').value.trim();
    if (!background) {
        showError('请输入历史背景');
        return;
    }
    historyBackground = background;
    showSuccess('历史背景已保存，请继续设定角色');
}

// 添加角色表单
function addCharacterForm() {
    const characterList = document.getElementById('characterList');
    const characterCount = characterList.children.length;
    const characterContainer = document.createElement('div');
    characterContainer.className = 'character-container';
    characterContainer.innerHTML = `
        <div class="character-header">
            <h3>角色 ${characterCount + 1}</h3>
            <button class="delete-character-btn" onclick="deleteCharacter(this)">
                <i class="fas fa-trash"></i>
            </button>
        </div>
        <div class="character-fields">
            <div class="input-group">
                <label>角色名称：</label>
                <input type="text" class="character-name" name="characterName${characterCount}" placeholder="输入角色名称">
            </div>
            <div class="input-group">
                <label>性格特点：</label>
                <input type="text" class="character-personality" name="characterPersonality${characterCount}" placeholder="描述角色的性格特点">
            </div>
            <div class="input-group">
                <label>外貌特征：</label>
                <input type="text" class="character-appearance" name="characterAppearance${characterCount}" placeholder="描述角色的外貌特征">
            </div>
            <div class="input-group">
                <label>背景故事：</label>
                <input type="text" class="character-background" name="characterBackground${characterCount}" placeholder="描述角色的背景故事">
            </div>
        </div>
    `;
    characterList.appendChild(characterContainer);
}

// 删除角色
function deleteCharacter(button) {
    const container = button.closest('.character-container');
    container.remove();
    // 更新剩余角色的编号
    const characterContainers = document.querySelectorAll('.character-container');
    characterContainers.forEach((container, index) => {
        container.querySelector('h3').textContent = `角色 ${index + 1}`;
    });
}

// 收集角色信息
function collectCharacters() {
    const characters = [];
    const characterContainers = document.querySelectorAll('.character-container');
    
    characterContainers.forEach((container, index) => {
        const name = container.querySelector('.character-name').value;
        const personality = container.querySelector('.character-personality').value;
        const appearance = container.querySelector('.character-appearance').value;
        const background = container.querySelector('.character-background').value;
        
        if (name && (personality || appearance || background)) {
            characters.push({
                name,
                personality,
                appearance,
                background
            });
        }
    });
    
    return characters;
}

// 使用角色信息生成故事
async function generateStoryWithCharacters() {
    try {
        const historyInput = document.getElementById('historyInput').value;
        if (!historyInput) {
            showError('请先输入历史背景');
            return;
        }

        // 获取所有角色设定
        const characterSettings = collectCharacters();

        if (characterSettings.length === 0) {
            showError('请至少添加一个角色设定');
            return;
        }

        const outputElement = document.getElementById('generatedStory');
        outputElement.innerHTML = ''; // 清空之前的内容

        // 构建角色描述
        const characterDescriptions = characterSettings.map((char, index) => {
            return `角色${index + 1}：
姓名：${char.name}
性格特点：${char.personality || '未设定'}
外貌特征：${char.appearance || '未设定'}
背景故事：${char.background || '未设定'}`;
        }).join('\n\n');

        const systemPrompt = `你是一位专业的儿童漫画故事创作者，擅长创作适合小学生阅读的有趣故事。
请注意以下要求：
1. 语言要简单易懂，避免使用复杂词汇
2. 故事要富有教育意义和正面价值观
3. 情节要生动有趣，富有想象力
4. 人物形象要鲜明，性格要积极向上
5. 避免暴力、恐怖等不适合儿童的内容
6. 故事要有清晰的起承转合结构
7. 每个部分要按照指定格式输出
8. 必须使用所有提供的角色，确保每个角色都有其独特的表现和发展`;

        const prompt = `请基于以下历史背景和角色设定创作一个适合小学生阅读的漫画故事：

历史背景：
${historyInput}

角色设定：
${characterDescriptions}

请严格按照以下格式输出故事内容，并确保所有角色都在故事中得到充分展现：

【故事标题】
[根据所有角色特点和历史背景创作一个吸引小学生的故事标题]

【故事梗概】
[用2-3句话概括故事的主要内容，提及所有主要角色]

【主要人物】
${characterSettings.map(char => `- ${char.name}：
  性格特点：${char.personality || '未设定'}
  在故事中的角色：[描述该角色在故事中的定位和作用]`).join('\n')}

【故事正文】
第一章：相遇
[描写故事的开始，介绍所有角色是如何相遇或联系在一起的，200-300字]

第二章：冒险开始
[描写主要冲突的出现，展示每个角色面对挑战时的不同反应和特点，200-300字]

第三章：团队合作
[描写角色们如何互相配合解决问题，突出每个角色的独特贡献，200-300字]

第四章：圆满结局
[描写故事的结局，展示每个角色的成长和收获，200-300字]

【每个角色的成长】
${characterSettings.map(char => `- ${char.name}的收获：
  [描述这个角色在故事中学到了什么，有什么成长]`).join('\n')}

【故事主旨】
[用一句话总结这个故事想要传达的道理或价值观]

【适合年龄】
[建议阅读年龄段，例如：8-12岁]

请确保：
1. 每个角色都有独特的性格特点和故事线
2. 角色之间有丰富的互动和对手戏
3. 故事情节符合历史背景
4. 每个章节都要突出不同角色的表现
5. 结局要体现所有角色的成长`;

        // 使用自定义的API调用函数
        const content = await callDeepseekAPI(prompt, systemPrompt, 'generatedStory');
        
        // 格式化显示内容
        const formattedContent = content.replace(/【/g, '<h3>【').replace(/】/g, '】</h3>')
            .replace(/\n/g, '<br>')
            .replace(/第[一二三四]章：[^\n]+/g, match => `<h4>${match}</h4>`);
        
        outputElement.innerHTML = formattedContent;
        
        showSuccess('故事生成完成！');
        return content;
    } catch (error) {
        console.error('生成故事时出错:', error);
        showError('生成故事失败，请重试');
    }
}

// 添加带重试机制的API调用函数
async function callDeepseekAPIWithRetry(prompt, systemPrompt, target, maxTokens = 2000, maxRetries = 3, params = {}) {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
        try {
            // 确保API密钥存在
            if (!apiKey) {
                throw new Error('未设置API密钥，请先设置API密钥');
            }

            const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: "deepseek-chat",
                    messages: [
                        {
                            "role": "system",
                            "content": systemPrompt
                        },
                        {
                            "role": "user",
                            "content": prompt
                        }
                    ],
                    temperature: params.temperature || 0.8,
                    max_tokens: maxTokens,
                    top_p: params.top_p || 0.95,
                    presence_penalty: params.presence_penalty || 0,
                    frequency_penalty: params.frequency_penalty || 0,
                    stream: true
                })
            });

            if (!response.ok) {
                if (response.status === 401) {
                    localStorage.removeItem('apiKey');
                    apiKey = null;
                    document.getElementById('loginContainer').style.display = 'block';
                    document.getElementById('mainContainer').style.display = 'none';
                    throw new Error('API密钥无效，请重新设置API密钥');
                } else if (response.status === 429) {
                    // 处理速率限制错误
                    const retryAfter = response.headers.get('Retry-After') || 60; // 默认1分钟
                    throw new Error(`速率限制，请等待${retryAfter}秒后重试`);
                }
                throw new Error(`API请求失败: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let content = '';
            let outputElement = document.getElementById(target);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.trim() === '') continue;
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') continue;
                        try {
                            const parsed = JSON.parse(data);
                            const text = parsed.choices[0].delta.content || '';
                            content += text;
                            if (outputElement) {
                                outputElement.innerHTML = content.replace(/\n/g, '<br>');
                                outputElement.scrollTop = outputElement.scrollHeight;
                            }
                        } catch (e) {
                            console.error('解析响应数据时出错:', e);
                        }
                    }
                }
            }

            return content;
        } catch (error) {
            console.error(`API调用失败 (尝试 ${i + 1}/${maxRetries}):`, error);
            lastError = error;
            
            // 如果是认证错误，立即停止重试
            if (error.message.includes('API密钥无效')) {
                throw error;
            }
            
            // 如果是速率限制错误，显示等待时间
            if (error.message.includes('速率限制')) {
                showError(error.message);
                // 等待指定时间后再重试
                const waitTime = parseInt(error.message.match(/\d+/)[0]) * 1000;
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }
            
            // 其他错误则使用指数退避重试
            if (i < maxRetries - 1) {
                const waitTime = Math.pow(2, i) * 1000;
                showError(`请求失败，${waitTime/1000}秒后重试...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }
    throw lastError;
}

// 生成历史典故
async function generateHistoricalStory() {
    try {
        // 定义不同类型的典故主题
        const storyThemes = [
            "战国故事",
            "三国典故",
            "春秋故事",
            "唐朝典故",
            "宋朝故事",
            "明清典故",
            "成语故事",
            "寓言故事"
        ];

        // 随机选择一个主题
        const randomTheme = storyThemes[Math.floor(Math.random() * storyThemes.length)];
        
        const systemPrompt = `你是一位专业的历史典故专家。请严格按照以下规则生成历史典故：

输出格式要求：
1. 必须包含且仅包含以下四个部分：
   【典故名称】名称（4-8个字）
   【发生时间】具体朝代或年份
   【主要人物】1-2个历史人物名字
   【典故内容】20字以内的故事梗概

2. 典故要求：
   - 必须是真实的历史典故
   - 内容要有教育意义
   - 适合改编为漫画
   - 情节要完整
   - 避免过于常见的典故

3. 输出要求：
- 每个部分要简洁明了
- 内容要有历史依据
- 适合中小学生阅读

示例格式：
   【典故名称】负荆请罪
   【发生时间】战国时期
   【主要人物】廉颇、蔺相如
   【典故内容】廉颇认错，背荆请罪，蔺相如释怨，成为知己。

请严格按照以上格式输出，不要添加任何额外内容。`;

        const prompt = `请生成一个有关【${randomTheme}】的历史典故。
要求：
1. 严格按照系统提示中的格式输出
2. 典故内容必须控制在20字以内
3. 避免使用过于常见的典故
4. 内容要适合漫画改编`;

        const outputElement = document.getElementById('historyInput');
        const originalContent = outputElement.value;
        outputElement.value = '正在生成典故...';

        try {
            const content = await callDeepseekAPIWithRetry(prompt, systemPrompt, '', 1000, 3, {
                temperature: 0.8,    // 降低temperature以提高稳定性
                top_p: 0.9,         // 降低top_p以提高输出的确定性
                presence_penalty: 0.3,
                frequency_penalty: 0.3
            });

            // 解析和格式化输出
            const lines = content.split('\n');
            let formattedContent = '';
            let sections = {
                '典故名称': '',
                '发生时间': '',
                '主要人物': '',
                '典故内容': ''
            };

            // 提取每个部分的内容
            for (const line of lines) {
                for (const section in sections) {
                    if (line.includes(`【${section}】`)) {
                        sections[section] = line.split('】')[1].trim();
                    }
                }
            }

            // 验证所有部分是否都有内容
            let missingSection = false;
            for (const section in sections) {
                if (!sections[section]) {
                    missingSection = true;
                    break;
                }
            }

            // 如果有缺失部分，使用默认格式重新组织内容
            if (missingSection) {
                const contentText = content.replace(/\n/g, ' ').substring(0, 100);
                formattedContent = `【典故名称】${contentText.slice(0, 8)}
【发生时间】未知年代
【主要人物】历史人物
【典故内容】${contentText.slice(0, 20)}`;
            } else {
                // 使用提取的内容组织格式化输出
                formattedContent = `【典故名称】${sections['典故名称']}
【发生时间】${sections['发生时间']}
【主要人物】${sections['主要人物']}
【典故内容】${sections['典故内容']}`;
            }

            outputElement.value = formattedContent;
            showSuccess('历史典故生成完成！');
        } catch (error) {
            outputElement.value = originalContent;
            throw error;
        }
    } catch (error) {
        console.error('生成历史典故时出错:', error);
        showError(error.message || '生成历史典故失败，请重试');
    }
}

// 创建剧本
async function createStoryScript() {
    try {
        const historyBackground = document.getElementById('historyInput').value;
        const generatedStory = document.getElementById('generatedStory').innerHTML;
        
        if (!historyBackground || !generatedStory) {
            showError('请先完成历史背景设定和故事生成');
            return;
        }

        const outputElement = document.getElementById('storyScript');
        outputElement.innerHTML = ''; // 清空之前的内容

        const systemPrompt = `你是一位专业的漫画剧本家。请基于历史背景和故事内容，创作一个结构完整、情节吸引人的漫画剧本。
注意：
1. 保持故事节奏的张力
2. 突出人物性格特点
3. 注重场景描写的细节
4. 对话要简练有力
5. 确保每个场景都有清晰的视觉描述`;

        const parts = [
            {
                title: "第一幕：开场与人物介绍",
                prompt: `基于以下历史背景和故事内容，创作漫画剧本的开场部分：

历史背景：
${historyBackground}

故事内容：
${generatedStory}

请创作开场部分的剧本，包括：
1. 开场场景的详细描写
2. 主要人物的第一次登场
3. 基本背景信息的设定
4. 初始冲突的暗示

注意：
- 场景描写要具体生动
- 人物登场要有特色
- 对话要自然流畅
- 为后续发展埋下伏笔`,
                maxTokens: 2000
            },
            {
                title: "第二幕：情节发展",
                prompt: `继续基于故事内容，创作剧本的主体情节部分：

历史背景：
${historyBackground}

故事内容：
${generatedStory}

请创作主要情节部分，包括：
1. 核心冲突的展开
2. 人物关系的发展
3. 重要事件的描写
4. 情节转折点

注意：
- 保持情节的连贯性
- 突出人物的成长变化
- 场景转换要流畅
- 冲突要层层递进`,
                maxTokens: 2000
            },
            {
                title: "第三幕：高潮与结局",
                prompt: `基于前文内容，创作剧本的高潮和结局部分：

历史背景：
${historyBackground}

故事内容：
${generatedStory}

请创作高潮和结局部分，包括：
1. 核心冲突的最终爆发
2. 人物命运的最终走向
3. 主题思想的升华
4. 结局的情感处理

注意：
- 高潮场景要有冲击力
- 人物行为要符合性格
- 结局要有深度和余韵
- 确保与前文的呼应`,
                maxTokens: 2000
            }
        ];

        let fullScript = '';
        let previousContent = '';

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            try {
                // 创建进度提示
                const progressDiv = document.createElement('div');
                progressDiv.className = 'generating-notice';
                progressDiv.textContent = `正在生成${part.title}...`;
                outputElement.appendChild(progressDiv);

                // 在提示词中加入前文内容的摘要（如果有）
                let enhancedPrompt = part.prompt;
                if (previousContent) {
                    enhancedPrompt = `前文概要：
${previousContent.substring(0, 500)}...

${part.prompt}`;
                }

                // 使用自定义的API调用函数
                const content = await callDeepseekAPIWithRetry(enhancedPrompt, systemPrompt, '', part.maxTokens);
                
                // 保存这部分内容的摘要，用于下一部分的生成
                previousContent = content;

                // 移除进度提示
                progressDiv.remove();

                // 添加分隔线和标题
                if (i > 0) {
                    const separator = document.createElement('div');
                    separator.className = 'script-separator';
                    separator.innerHTML = '<hr>';
                    outputElement.appendChild(separator);
                }

                // 创建新的内容容器
                const contentDiv = document.createElement('div');
                contentDiv.className = 'script-part';
                contentDiv.innerHTML = `
                    <h3>${part.title}</h3>
                    <div class="script-content">${content.replace(/\n/g, '<br>')}</div>
                `;
                outputElement.appendChild(contentDiv);

                fullScript += (i > 0 ? '\n\n' : '') + content;

                // 滚动到底部
                outputElement.scrollTop = outputElement.scrollHeight;

                // 在部分之间添加短暂延迟，避免API限制
                if (i < parts.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            } catch (error) {
                console.error(`生成${part.title}时出错:`, error);
                const errorDiv = document.createElement('div');
                errorDiv.className = 'error-notice';
                errorDiv.textContent = `生成${part.title}时出错: ${error.message}`;
                outputElement.appendChild(errorDiv);
            }
        }

        showSuccess('故事剧本生成完成！');
        return fullScript;
    } catch (error) {
        console.error('生成故事剧本时出错:', error);
        showError('生成故事剧本失败，请重试');
    }
}

// 生成角色
async function generateCharacter() {
    try {
        // 获取历史背景
        const historyInput = document.getElementById('historyInput').value;
        if (!historyInput) {
            showError('请先输入历史背景');
            return;
        }

        const characterTypes = [
            "小英雄", "小伙伴", "智慧长者", "勇敢少年",
            "聪明女孩", "可爱小童", "机灵孩童", "小小侠客"
        ];

        const personalityTraits = [
            "善良", "勇敢", "聪明", "友善", "诚实",
            "乐观", "活泼", "好学", "有趣", "正义"
        ];

        // 随机选择角色类型和性格特征
        const randomType = characterTypes[Math.floor(Math.random() * characterTypes.length)];
        const randomTrait = personalityTraits[Math.floor(Math.random() * personalityTraits.length)];

        const systemPrompt = `你是一位专门为中小学生创作故事的角色设计师。
请按照以下要求设计一个有趣的历史人物：

1. 角色设定规则：
   - 要像在讲故事一样生动有趣
   - 用简单易懂的语言描述
   - 避免使用复杂的成语和难懂的词语
   - 性格特点要积极向上
   - 要有教育意义和正能量
   - 适合中小学生阅读

2. 输出格式要求：
   【角色名字】要有趣好记，2-4个字
   【性格特点】用简单的语言描述2-3个性格特征
   【外貌打扮】描述角色的样子，要生动有趣
   【小故事】讲一个关于这个角色的有趣小故事

3. 示例：
   【角色名字】小明智
   【性格特点】爱动脑筋，喜欢帮助别人
   【外貌打扮】圆圆的脸蛋，总是背着一个装满书的小布包
   【小故事】他经常用自己想到的好办法帮助村里的小朋友解决困难，大家都很喜欢他

请记住：
- 内容要有趣但不复杂
- 要让小朋友容易理解
- 要有正面的教育意义
- 避免消极或不适合儿童的内容`;

        const prompt = `请根据这个历史背景：
${historyInput}

创造一个${randomType}角色，性格是${randomTrait}的。

要求：
1. 角色要适合中小学生理解
2. 要像讲故事一样有趣
3. 用简单的话描述
4. 要有教育意义
5. 避免使用难懂的词语

请严格按照示例格式输出！`;

        // 先添加一个空的角色表单
        addCharacterForm();
        const characterList = document.getElementById('characterList');
        const newCharacterContainer = characterList.lastElementChild;
        
        // 标记为生成中状态
        newCharacterContainer.classList.add('generating');
        const inputs = newCharacterContainer.querySelectorAll('input');
        inputs.forEach(input => input.value = '正在创造角色...');

        // 调用API生成角色
        const content = await callDeepseekAPIWithRetry(prompt, systemPrompt, '', 1000, 3, {
            temperature: 0.85,
            top_p: 0.92,
            presence_penalty: 0.4,
            frequency_penalty: 0.4
        });

        // 解析生成的内容
        const lines = content.split('\n');
        let characterInfo = {
            name: '',
            personality: '',
            appearance: '',
            background: ''
        };

        for (const line of lines) {
            if (line.includes('【角色名字】')) {
                characterInfo.name = line.split('】')[1].trim();
            } else if (line.includes('【性格特点】')) {
                characterInfo.personality = line.split('】')[1].trim();
            } else if (line.includes('【外貌打扮】')) {
                characterInfo.appearance = line.split('】')[1].trim();
            } else if (line.includes('【小故事】')) {
                characterInfo.background = line.split('】')[1].trim();
            }
        }

        // 填充生成的内容到表单
        const nameInput = newCharacterContainer.querySelector('.character-name');
        const personalityInput = newCharacterContainer.querySelector('.character-personality');
        const appearanceInput = newCharacterContainer.querySelector('.character-appearance');
        const backgroundInput = newCharacterContainer.querySelector('.character-background');

        nameInput.value = characterInfo.name || '小主角';
        personalityInput.value = characterInfo.personality || '善良勇敢';
        appearanceInput.value = characterInfo.appearance || '可爱的样子';
        backgroundInput.value = characterInfo.background || '一个有趣的小故事';

        // 移除生成中状态，添加高亮效果
        newCharacterContainer.classList.remove('generating');
        newCharacterContainer.classList.add('highlight');
        
        // 3秒后移除高亮效果
        setTimeout(() => {
            newCharacterContainer.classList.remove('highlight');
        }, 3000);

        showSuccess('新角色创造完成啦！');
    } catch (error) {
        console.error('创造角色时出错:', error);
        showError(error.message || '创造角色失败了，让我们再试一次吧！');
        
        // 如果生成失败，移除最后添加的表单
        const characterList = document.getElementById('characterList');
        if (characterList.lastElementChild) {
            characterList.lastElementChild.remove();
        }
    }
}

// 生成剧本
async function generateScript() {
    try {
        // 获取历史背景和故事内容
        const historyInput = document.getElementById('historyInput').value;
        const storyInput = document.getElementById('storyInput').value;
        const characterList = document.getElementById('characterList');
        
        if (!historyInput || !storyInput) {
            showError('请先完成历史背景和故事内容的创作');
            return;
        }

        // 收集所有角色信息
        let characters = [];
        const characterContainers = characterList.getElementsByClassName('character-container');
        for (const container of characterContainers) {
            const name = container.querySelector('.character-name').value;
            const personality = container.querySelector('.character-personality').value;
            const appearance = container.querySelector('.character-appearance').value;
            if (name && personality && appearance) {
                characters.push({ name, personality, appearance });
            }
        }

        if (characters.length === 0) {
            showError('请至少创建一个角色');
            return;
        }

        const systemPrompt = `你是一位专业的漫画剧本作家，擅长将故事改编为生动有趣的分镜剧本。
请遵循以下规则创作剧本：

1. 输出格式要求：
   每个场景必须包含以下部分：
   【场景序号】数字编号
   【场景标题】简短描述场景
   【场景描述】具体的环境描述
   【分镜内容】
   - 画面描述：具体的画面构图
   - 对话内容：角色的对话
   - 情绪描写：角色的表情和动作
   
2. 剧本要求：
   - 每个场景要生动形象
   - 对话要简洁自然
   - 要突出角色性格特点
   - 场景转换要流畅
   - 要有起承转合的结构
   - 适合中小学生阅读

3. 示例格式：
   【场景1】初见
   【场景描述】春日午后，古朴的庭院
   【分镜内容】
   画面：远景展现一座幽静的庭院，樱花飘落
   对话：小明："这里真美啊！"
   情绪：小明露出惊喜的表情，眼睛闪闪发亮

4. 注意事项：
   - 场景数量控制在4-6个
   - 每个场景要精简但完整
   - 要体现历史背景特色
   - 要符合人物性格设定
   - 适合中小学生阅读`;

        const prompt = `请根据以下内容创作一个生动的漫画剧本：

1. 历史背景：
${historyInput}

2. 故事内容：
${storyInput}

3. 角色信息：
${characters.map(char => 
    `角色：${char.name}
     性格：${char.personality}
     外貌：${char.appearance}`
).join('\n')}

要求：
1. 严格按照系统提示中的格式输出
2. 场景要围绕故事主线展开
3. 充分利用已有的角色
4. 对话要符合角色性格
5. 每个场景都要有具体的环境描述和人物表情动作
6. 要让故事更生动有趣
7. 适合改编成漫画`;

        const outputElement = document.getElementById('scriptInput');
        const originalContent = outputElement.value;
        outputElement.value = '正在创作剧本...';

        try {
            const content = await callDeepseekAPIWithRetry(prompt, systemPrompt, '', 2000, 3, {
                temperature: 0.85,
                top_p: 0.92,
                presence_penalty: 0.4,
                frequency_penalty: 0.4
            });

            // 解析和格式化输出
            const storyboards = content.split('【').filter(section => section.trim().startsWith('场景'))
                .map(board => board.trim());

            if (storyboards.length === 0) {
                // 如果没有正确的场景格式，直接显示原始内容
                outputElement.value = content;
            } else {
                // 格式化场景内容
                const formattedContent = storyboards.join('\n\n');
                outputElement.value = formattedContent;
            }

            showSuccess('剧本创作完成啦！');
        } catch (error) {
            outputElement.value = originalContent;
            throw error;
        }
    } catch (error) {
        console.error('创作剧本时出错:', error);
        showError(error.message || '剧本创作遇到了问题，让我们再试一次吧！');
    }
}

// 分批生成分镜脚本
async function generateStoryboardInParts(script) {
    try {
        // 将剧本按场景分割
        const scenes = script.split('【场景序号】').filter(scene => scene.trim());
        if (scenes.length === 0) {
            throw new Error('未能识别到有效的场景内容，请检查剧本格式');
        }

        let allStoryboards = [];
        let currentPart = '';
        let partCount = 1;
        let totalScenes = scenes.length;

        showLoading(`正在处理第 ${partCount} 部分，共 ${totalScenes} 个场景...`);

        for (const scene of scenes) {
            // 添加当前场景到当前部分
            currentPart += '【场景序号】' + scene;

            // 如果当前部分达到一定长度或是最后一个场景，则生成分镜
            if (currentPart.length >= 1500 || scene === scenes[scenes.length - 1]) {
                const systemPrompt = `你是一位专业的漫画分镜脚本编剧。请基于以下剧本内容，创作详细的分镜脚本。
这是第 ${partCount} 部分的剧本，总共 ${totalScenes} 个场景。请确保分镜编号的连续性。

请按照以下格式输出每个场景的分镜：

【场景】（场景描述）
【分镜号】（场景序号-分镜序号）
【分格】
- 规格：（标准/跨页/全页等）
- 比例：（横长/竖长/方形等）
【构图要素】
- 视点：（正视/俯视/仰视等）
- 景别：（远景/中景/特写等）
- 角度：（平视/俯视/仰视等）
【画面重点】
- 主体：（画面主要表现对象）
- 配置：（画面元素布局）
- 气氛：（画面情绪氛围）
【运动表现】
- 速度线/动作线/特效等
【文字配置】
- 对话框/旁白框的位置和内容

请确保：
1. 每个场景的分镜数量合理，通常3-5个
2. 场景转换流畅，节奏把控合理
3. 充分利用不同景别和角度
4. 画面构图要有层次感
5. 符合漫画的视觉表现特点
6. 分镜号要连续，不要重复`;

                try {
                    const response = await callDeepseekAPIWithRetry(currentPart, systemPrompt, '', 2000, 3, {
                        temperature: 0.7,
                        top_p: 0.95
                    });

                    if (response) {
                        allStoryboards.push(response);
                        showSuccess(`第 ${partCount}/${Math.ceil(totalScenes/2)} 部分分镜生成完成`);
                    } else {
                        throw new Error(`第 ${partCount} 部分生成失败`);
                    }
                } catch (error) {
                    console.error(`生成第 ${partCount} 部分时出错:`, error);
                    throw error;
                }

                // 重置当前部分
                currentPart = '';
                partCount++;
                
                // 添加延迟以避免API限制
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                if (partCount <= Math.ceil(totalScenes/2)) {
                    showLoading(`正在处理第 ${partCount} 部分，共 ${totalScenes} 个场景...`);
                }
            }
        }

        // 合并所有分镜内容
        return allStoryboards.join('\n\n');
    } catch (error) {
        console.error('分批生成分镜时出错:', error);
        throw error;
    }
}

// 生成分镜脚本
async function generateStoryboard() {
    try {
        const outputElement = document.getElementById('storyboard');
        const scriptElement = document.getElementById('storyScript');
        
        if (!scriptElement) {
            throw new Error('未找到剧本元素');
        }
        
        // 检查剧本内容
        let script = '';
        
        // 如果是textarea或input元素
        if (scriptElement.value !== undefined) {
            script = scriptElement.value.trim();
        } 
        // 如果是div或其他元素
        else if (scriptElement.innerHTML) {
            // 移除HTML标签
            script = scriptElement.innerHTML.replace(/<[^>]*>/g, '').trim();
        }
        // 如果是文本内容
        else if (scriptElement.textContent) {
            script = scriptElement.textContent.trim();
        }

        if (!script) {
            throw new Error('请先完成剧本的创作（第四步）');
        }

        showLoading('正在准备生成分镜脚本...');

        // 分批生成分镜
        const response = await generateStoryboardInParts(script);

        if (!response) {
            throw new Error('分镜脚本生成失败，请重试');
        }

        // 解析并显示在卡片中
        parseAndDisplayStoryboard(response);
        
        // 同时保存到原始容器中
        if (outputElement) {
            outputElement.innerHTML = formatStoryboardContent(response);
        }
        
        showSuccess('所有分镜脚本创作完成！');
        
        // 保存到localStorage
        saveToLocalStorage('storyboard', response);
        
        // 添加帮助信息
        const helpDiv = document.createElement('div');
        helpDiv.className = 'help-text';
        helpDiv.innerHTML = `
            <h4>分镜说明：</h4>
            <ul>
                <li><strong>ELS (Extreme Long Shot)</strong>: 超远景，展现宏大场面</li>
                <li><strong>LS (Long Shot)</strong>: 远景，环境全貌</li>
                <li><strong>FS (Full Shot)</strong>: 全景，完整动作</li>
                <li><strong>MS (Medium Shot)</strong>: 中景，人物半身</li>
                <li><strong>CU (Close Up)</strong>: 特写，面部表情</li>
                <li><strong>ECU (Extreme Close Up)</strong>: 超特写，局部细节</li>
            </ul>
        `;
        
        if (outputElement) {
            const parentElement = outputElement.parentElement;
            if (parentElement.querySelector('.help-text')) {
                parentElement.querySelector('.help-text').remove();
            }
            parentElement.appendChild(helpDiv);
        }
        
        return response;
    } catch (error) {
        console.error('创作分镜脚本时出错:', error);
        const outputElement = document.getElementById('storyboard');
        if (outputElement) {
            outputElement.innerHTML = '';
        }
        showError(error.message || '分镜脚本创作遇到了问题，请重试');
        return null;
    }
}

// 解析分镜内容并显示在卡片中
function parseAndDisplayStoryboard(content) {
    try {
        const container = document.getElementById('storyboard-display');
        if (!container) {
            console.error('未找到storyboard-display元素');
            return;
        }

        container.innerHTML = ''; // 清空现有内容

        // 分割场景
        const scenes = content.split('【场景】').filter(scene => scene.trim());
        
        if (scenes.length === 0) {
            throw new Error('未能识别到有效的分镜内容');
        }

        scenes.forEach((scene, index) => {
            const sceneDiv = document.createElement('div');
            sceneDiv.className = 'storyboard-card';
            
            // 解析场景内容
            const sections = scene.split('【').filter(section => section.trim());
            let formattedContent = '<div class="scene-content">';
            
            sections.forEach(section => {
                const [title, ...content] = section.split('】');
                if (title && content) {
                    formattedContent += `
                        <div class="section">
                            <h4>${title}</h4>
                            <div class="section-content">
                                ${content.join('】').trim().split('\n').map(line => {
                                    const trimmedLine = line.trim();
                                    return trimmedLine ? `<p>${trimmedLine}</p>` : '';
                                }).filter(line => line).join('')}
                            </div>
                        </div>
                    `;
                }
            });
            
            formattedContent += '</div>';
            sceneDiv.innerHTML = formattedContent;
            
            // 添加场景标题
            const titleDiv = document.createElement('div');
            titleDiv.className = 'scene-header';
            titleDiv.innerHTML = `<h3>场景 ${index + 1}</h3>`;
            sceneDiv.insertBefore(titleDiv, sceneDiv.firstChild);
            
            container.appendChild(sceneDiv);
        });
    } catch (error) {
        console.error('解析分镜内容时出错:', error);
        showError('分镜内容解析失败：' + error.message);
    }
}

// 格式化分镜内容
function formatStoryboardContent(content) {
    const scenes = content.split('【场景】').filter(scene => scene.trim());
    let formattedHtml = '';

    scenes.forEach(scene => {
        const sceneLines = scene.trim().split('\n');
        const sceneTitle = sceneLines[0];
        
        formattedHtml += `
        <div class="storyboard-scene">
            <div class="scene-header">
                <i class="fas fa-film"></i> 场景：${sceneTitle}
            </div>
            <div class="scene-content">
                ${sceneLines.slice(1).map(line => {
                    if (line.trim().startsWith('【')) {
                        return `<h4>${line.trim()}</h4>`;
                    } else {
                        return `<p>${line.trim()}</p>`;
                    }
                }).join('')}
            </div>
        </div>`;
    });

    return formattedHtml || content;
}

// 插入镜头类型
function insertShotType(type) {
    const textarea = document.getElementById('storyboardInput');
    const shotTypes = {
        'ELS': '超远景：展现宏大场面',
        'LS': '远景：环境全貌',
        'FS': '全景：完整动作',
        'MS': '中景：人物半身',
        'CU': '特写：面部表情',
        'ECU': '超特写：局部细节'
    };
    
    const cursorPos = textarea.selectionStart;
    const textBefore = textarea.value.substring(0, cursorPos);
    const textAfter = textarea.value.substring(cursorPos);
    
    const shotText = `【镜头大小】${type}（${shotTypes[type]}）\n`;
    
    textarea.value = textBefore + shotText + textAfter;
    textarea.focus();
    textarea.selectionStart = cursorPos + shotText.length;
    textarea.selectionEnd = cursorPos + shotText.length;
}

// 插入镜头角度
function insertAngle(angle) {
    const textarea = document.getElementById('storyboardInput');
    const angleTypes = {
        'High': '俯视：压迫感、全局观',
        'Eye': '平视：客观叙事、对话',
        'Low': '仰视：英雄感、威严',
        'Dutch': '倾斜：紧张感'
    };
    
    const cursorPos = textarea.selectionStart;
    const textBefore = textarea.value.substring(0, cursorPos);
    const textAfter = textarea.value.substring(cursorPos);
    
    const angleText = `【镜头角度】${angle} Angle（${angleTypes[angle]}）\n`;
    
    textarea.value = textBefore + angleText + textAfter;
    textarea.focus();
    textarea.selectionStart = cursorPos + angleText.length;
    textarea.selectionEnd = cursorPos + angleText.length;
}

// 保存分镜脚本
function saveStoryboard() {
    try {
        const storyboardElement = document.getElementById('storyboard');
        if (!storyboardElement || !storyboardElement.innerHTML.trim()) {
            throw new Error('没有可保存的分镜脚本内容');
        }

        // 获取当前时间作为文件名的一部分
        const date = new Date();
        const timestamp = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}_${date.getHours().toString().padStart(2, '0')}${date.getMinutes().toString().padStart(2, '0')}`;
        
        // 创建Blob对象
        const content = storyboardElement.innerHTML;
        const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
        
        // 创建下载链接
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `分镜脚本_${timestamp}.html`;
        
        // 触发下载
        document.body.appendChild(a);
        a.click();
        
        // 清理
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        
        showSuccess('分镜脚本保存成功！');
    } catch (error) {
        console.error('保存分镜脚本时出错:', error);
        showError(error.message || '保存分镜脚本时出错');
    }
}

// 保存为纯文本格式
function saveStoryboardAsText() {
    try {
        const storyboardElement = document.getElementById('storyboard');
        if (!storyboardElement || !storyboardElement.innerHTML.trim()) {
            throw new Error('没有可保存的分镜脚本内容');
        }

        // 创建一个临时元素来解析HTML内容
        const temp = document.createElement('div');
        temp.innerHTML = storyboardElement.innerHTML;
        
        // 获取纯文本内容
        const textContent = temp.innerText;
        
        // 获取当前时间作为文件名的一部分
        const date = new Date();
        const timestamp = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}_${date.getHours().toString().padStart(2, '0')}${date.getMinutes().toString().padStart(2, '0')}`;
        
        // 创建Blob对象
        const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
        
        // 创建下载链接
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `分镜脚本_${timestamp}.txt`;
        
        // 触发下载
        document.body.appendChild(a);
        a.click();
        
        // 清理
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        
        showSuccess('分镜脚本保存成功！');
    } catch (error) {
        console.error('保存分镜脚本时出错:', error);
        showError(error.message || '保存分镜脚本时出错');
    }
}

// 加载保存的分镜脚本
function loadSavedStoryboard() {
    const savedContent = localStorage.getItem('savedStoryboard');
    if (savedContent) {
        const storyboardInput = document.getElementById('storyboardInput');
        storyboardInput.value = savedContent;
    }
}

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', function() {
    loadSavedStoryboard();
});

// 添加样式
const style = document.createElement('style');
style.textContent = `
.generating-notice {
    background-color: #fff3cd;
    color: #856404;
    border: 1px solid #ffeeba;
    padding: 15px;
    margin: 15px 0;
    border-radius: 8px;
    text-align: center;
}

.error-notice {
    background-color: #f8d7da;
    color: #721c24;
    border: 1px solid #f5c6cb;
    padding: 15px;
    margin: 15px 0;
    border-radius: 8px;
    text-align: center;
}

.story-part {
    margin: 20px 0;
    padding: 20px;
    background-color: #fff;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.story-part + .story-part {
    margin-top: 30px;
}

.success-notice {
    background-color: #d4edda;
    color: #155724;
    padding: 10px;
    margin: 10px 0;
    border-radius: 4px;
    text-align: center;
}

.output-box {
    position: relative;
}

.rate-limit-notice {
    background-color: #e2e3e5;
    color: #383d41;
    border: 1px solid #d6d8db;
    padding: 15px;
    margin: 15px 0;
    border-radius: 8px;
    text-align: center;
    animation: pulse 2s infinite;
}

.script-separator {
    margin: 20px 0;
    opacity: 0.5;
}

.script-part {
    margin: 20px 0;
    padding: 20px;
    background-color: #fff;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.script-part h3 {
    color: var(--primary-color);
    margin-bottom: 15px;
    padding-bottom: 10px;
    border-bottom: 2px solid var(--primary-color);
}

.storyboard-separator {
    margin: 25px 0;
    opacity: 0.5;
}

.storyboard-part {
    margin: 25px 0;
    padding: 25px;
    background-color: #fff;
    border-radius: 8px;
    box-shadow: 0 3px 6px rgba(0,0,0,0.1);
}

.storyboard-part h3 {
    color: var(--primary-color);
    margin-bottom: 20px;
    padding-bottom: 12px;
    border-bottom: 2px solid var(--primary-color);
    font-size: 1.4em;
}

.storyboard-content {
    line-height: 1.8;
    font-size: 1.1em;
}

.storyboard-content strong {
    color: var(--secondary-color);
}
`;
document.head.appendChild(style);

// 生成故事
async function generateStory() {
    try {
        const outputElement = document.getElementById('story');
        const backgroundElement = document.getElementById('background');
        const characterElement = document.getElementById('character');
        
        if (!backgroundElement || !characterElement) {
            throw new Error('请先完成故事背景和角色设定');
        }

        const background = backgroundElement.value.trim();
        const character = characterElement.value.trim();

        if (!background || !character) {
            throw new Error('故事背景和角色设定不能为空');
        }

        showLoading('正在创作故事...');

        // 系统提示词
        const systemPrompt = `你是一位专业的漫画故事创作者，擅长创作富有教育意义的儿童漫画故事。请基于用户提供的背景和角色设定，创作一个完整的故事。
你的输出应该严格按照指定格式，包含所有必要的部分。确保故事既有趣又有教育意义。`;
        
        const prompt = `基于以下背景和角色设定创作一个引人入胜的故事：

1. 故事背景：
${background}

2. 角色设定：
${character}

请创作一个完整的故事，要求：

1. 故事结构：
- 开篇：设置引人入胜的开场，介绍故事发生的时间、地点和主要人物
- 发展：通过一系列事件推动情节发展，体现人物性格和成长
- 高潮：设置戏剧性的冲突和转折点
- 结局：完美呼应开篇，体现故事的核心寓意和价值观

2. 故事要素：
- 紧密结合背景设定中提到的时代背景和环境特征
- 充分展现角色设定中的性格特点和独特魅力
- 情节要符合逻辑，富有戏剧性和感染力
- 通过故事情节自然地传递教育意义和价值观

3. 叙事风格：
- 适合漫画表现的视觉化描写
- 富有画面感的场景和动作描写
- 简洁有力的对话
- 适合中小学生阅读的表达方式

4. 核心要求：
- 故事情节要紧扣背景设定中提到的主题和寓意
- 通过主角的经历和成长，传递积极向上的价值观
- 结合当代青少年的生活经验和认知水平
- 故事要有教育意义，但不能过于说教

请按照以下格式输出：

【故事标题】
（一个简洁有力的标题）

【故事梗概】
（100字左右的故事概要）

【正文】
（分场景详细展开故事，每个场景都要有明确的情节推进和情感变化）

【故事主旨】
（简要说明故事的核心寓意和教育价值）

【适合年龄】
（建议阅读年龄段，例如：8-12岁）

请确保：
1. 每个角色都有独特的性格特点和故事线
2. 角色之间有丰富的互动和对手戏
3. 故事情节符合历史背景
4. 每个章节都要突出不同角色的表现
5. 结局要体现所有角色的成长`;

        // 设置较大的max_tokens以确保完整输出
        const response = await makeDeepseekRequest(prompt, {
            temperature: 0.7,
            max_tokens: 3000,
            top_p: 0.95
        });

        if (!response) throw new Error('故事生成失败，请重试');

        // 格式化输出内容
        const formattedResponse = response
            .replace(/【/g, '<h3>【')
            .replace(/】/g, '】</h3>')
            .replace(/\n/g, '<br>');

        outputElement.innerHTML = formattedResponse;
        showSuccess('故事创作完成！');
        
        // 保存到localStorage
        saveToLocalStorage('story', response);
        
        // 添加帮助信息
        const helpDiv = document.createElement('div');
        helpDiv.className = 'help-text';
        helpDiv.innerHTML = `
            <h4>分镜说明：</h4>
            <ul>
                <li><strong>ELS (Extreme Long Shot)</strong>: 超远景，展现宏大场面</li>
                <li><strong>LS (Long Shot)</strong>: 远景，环境全貌</li>
                <li><strong>FS (Full Shot)</strong>: 全景，完整动作</li>
                <li><strong>MS (Medium Shot)</strong>: 中景，人物半身</li>
                <li><strong>CU (Close Up)</strong>: 特写，面部表情</li>
                <li><strong>ECU (Extreme Close Up)</strong>: 超特写，局部细节</li>
            </ul>
        `;
        
        const parentElement = outputElement.parentElement;
        if (parentElement.querySelector('.help-text')) {
            parentElement.querySelector('.help-text').remove();
        }
        parentElement.appendChild(helpDiv);
        
        return response;
    } catch (error) {
        console.error('创作故事时出错:', error);
        const outputElement = document.getElementById('story');
        if (outputElement) {
            outputElement.innerHTML = '';
        }
        showError(error.message || '故事创作遇到了问题，请重试');
        return null;
    }
}

// 生成故事剧本
async function generateScript() {
    try {
        const storyElement = document.getElementById('storyOutput');
        if (!storyElement || !storyElement.value.trim()) {
            throw new Error('请先完成故事的创作（第三步）');
        }

        showLoading('正在创作剧本...');

        const story = storyElement.value.trim();
        const prompt = `请将以下故事改编为简洁的剧本格式。要求：
1. 场景描述简短精炼，每个场景不超过50字
2. 对话要简明扼要，突出重点
3. 整体结构清晰，分为3-5个主要场景
4. 每个场景包含：场景说明、人物对话和关键动作
5. 注重戏剧冲突，突出故事主线
6. 总字数控制在1000字以内

故事内容：${story}`;

        const response = await callDeepseekAPI(prompt);
        if (!response) {
            throw new Error('剧本生成失败，请重试');
        }

        // 格式化剧本内容
        const formattedScript = formatScript(response);
        
        // 显示剧本
        const scriptElement = document.getElementById('storyScript');
        if (scriptElement) {
            scriptElement.innerHTML = formattedScript;
            
            // 添加场景标记
            addSceneMarkers(scriptElement);
        }

        showSuccess('剧本创作完成！');
        
        // 保存到localStorage
        saveToLocalStorage('script', formattedScript);
        
        return formattedScript;
    } catch (error) {
        console.error('创作剧本时出错:', error);
        showError(error.message || '剧本创作遇到了问题，请重试');
        return null;
    }
}

// 格式化剧本
function formatScript(script) {
    // 移除多余的空行
    let formatted = script.replace(/\n{3,}/g, '\n\n');
    
    // 为场景添加样式
    formatted = formatted.replace(/场景\s*\d+[：:]/g, match => 
        `<h3 class="scene-title">${match}</h3>`);
    
    // 为场景说明添加样式
    formatted = formatted.replace(/【[^】]+】/g, match => 
        `<div class="scene-description">${match}</div>`);
    
    // 为对话添加样式
    formatted = formatted.replace(/([^：:：\n]+)(：|:|：)([^\n]+)/g, 
        '<div class="dialogue"><span class="character">$1$2</span>$3</div>');
    
    // 为动作说明添加样式
    formatted = formatted.replace(/（[^）]+）/g, match => 
        `<span class="action-note">${match}</span>`);
    
    return formatted;
}

// 添加场景标记
function addSceneMarkers(scriptElement) {
    const scenes = scriptElement.getElementsByClassName('scene-title');
    Array.from(scenes).forEach((scene, index) => {
        const marker = document.createElement('div');
        marker.className = 'scene-marker';
        marker.innerHTML = `<i class="fas fa-film"></i> ${index + 1}`;
        scene.prepend(marker);
    });
}
