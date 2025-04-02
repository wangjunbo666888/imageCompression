/**
 * 图片压缩工具的主要 JavaScript 文件
 * 实现图片上传、压缩、预览和下载功能
 */

// DOM 元素
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const compressionControls = document.getElementById('compressionControls');
const imagesList = document.getElementById('imagesList');
const imagesContainer = document.getElementById('imagesContainer');
const qualitySlider = document.getElementById('quality');
const qualityValue = document.getElementById('qualityValue');
const compressBtn = document.getElementById('compressBtn');
const downloadAllBtn = document.getElementById('downloadAllBtn');

// 当前处理的图片列表
let imageFiles = [];
let compressedImages = new Map(); // 存储压缩后的图片

/**
 * 格式化文件大小
 * @param {number} bytes - 文件大小（字节）
 * @returns {string} 格式化后的文件大小
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 压缩图片
 * @param {File} file - 原始图片文件
 * @param {number} quality - 压缩质量（0-1）
 * @returns {Promise<Blob>} 压缩后的图片数据
 */
function compressImage(file, quality) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                // 计算目标尺寸
                let { width, height } = img;
                const maxWidth = 1920;  // 降低最大宽度限制
                const maxHeight = 1080; // 降低最大高度限制
                
                // 计算压缩比例
                let scale = 1;
                
                // 如果图片尺寸超过限制，计算缩放比例
                if (width > maxWidth || height > maxHeight) {
                    scale = Math.min(maxWidth / width, maxHeight / height);
                    width *= scale;
                    height *= scale;
                }
                
                // 创建缩放后的canvas
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                
                // 绘制图片
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, width, height);
                
                // 计算最终压缩质量
                let finalQuality = quality;
                const originalSizeMB = file.size / (1024 * 1024);
                
                // 根据文件大小动态调整质量
                if (originalSizeMB > 1) {
                    // 对于大于1MB的图片，额外降低质量
                    finalQuality = Math.min(quality, 0.6);
                }
                
                // 对于PNG格式，先转换为JPEG以获得更好的压缩效果
                const outputType = file.type === 'image/png' ? 'image/jpeg' : file.type;
                
                // 使用较低质量进行初次压缩
                canvas.toBlob(
                    (blob) => {
                        if (!blob) {
                            reject(new Error('压缩失败'));
                            return;
                        }
                        
                        // 如果压缩后仍然大于原图，尝试进一步压缩
                        if (blob.size >= file.size) {
                            // 创建新的canvas进行二次压缩
                            const secondCanvas = document.createElement('canvas');
                            const secondCtx = secondCanvas.getContext('2d');
                            
                            // 稍微降低分辨率
                            const secondScale = 0.8;
                            secondCanvas.width = width * secondScale;
                            secondCanvas.height = height * secondScale;
                            
                            // 创建临时图片对象
                            const tempImg = new Image();
                            tempImg.src = URL.createObjectURL(blob);
                            
                            tempImg.onload = () => {
                                // 绘制到新canvas
                                secondCtx.drawImage(tempImg, 0, 0, secondCanvas.width, secondCanvas.height);
                                
                                // 使用更低的质量进行二次压缩
                                secondCanvas.toBlob(
                                    (secondBlob) => {
                                        if (!secondBlob) {
                                            reject(new Error('二次压缩失败'));
                                            return;
                                        }
                                        
                                        // 如果二次压缩后仍然更大，则返回原图
                                        if (secondBlob.size >= file.size) {
                                            resolve(file);
                                        } else {
                                            resolve(secondBlob);
                                        }
                                        
                                        // 清理临时对象
                                        URL.revokeObjectURL(tempImg.src);
                                    },
                                    outputType,
                                    Math.min(finalQuality, 0.5)
                                );
                            };
                            
                            tempImg.onerror = () => {
                                reject(new Error('二次压缩图片加载失败'));
                                URL.revokeObjectURL(tempImg.src);
                            };
                        } else {
                            resolve(blob);
                        }
                    },
                    outputType,
                    finalQuality
                );
            };
            img.onerror = reject;
        };
        reader.onerror = reject;
    });
}

/**
 * 创建图片项元素
 * @param {File} file - 图片文件
 * @returns {HTMLElement} 图片项元素
 */
function createImageItem(file) {
    const item = document.createElement('div');
    item.className = 'image-item';
    item.dataset.filename = file.name;
    
    item.innerHTML = `
        <div class="preview-container">
            <img src="${URL.createObjectURL(file)}" alt="${file.name}">
        </div>
        <div class="image-info">
            <div class="filename">${file.name}</div>
            <div class="filesize">${formatFileSize(file.size)}</div>
        </div>
        <div class="compression-info">
            <div class="status">等待压缩</div>
            <div class="compressed-size"></div>
        </div>
    `;
    
    return item;
}

/**
 * 处理图片上传
 * @param {FileList} files - 上传的图片文件列表
 */
async function handleImageUpload(files) {
    // 过滤出支持的图片格式
    const validFiles = Array.from(files).filter(file => 
        file.type.match(/image\/(jpeg|png)/)
    );
    
    if (validFiles.length === 0) {
        alert('请上传 JPG 或 PNG 格式的图片！');
        return;
    }
    
    // 清空现有列表
    imageFiles = [];
    compressedImages.clear();
    imagesContainer.innerHTML = '';
    
    // 添加新文件
    imageFiles = validFiles;
    
    // 显示控制区域和图片列表
    compressionControls.style.display = 'block';
    imagesList.style.display = 'block';
    
    // 创建图片预览项
    imageFiles.forEach(file => {
        const item = createImageItem(file);
        imagesContainer.appendChild(item);
    });
    
    // 重置压缩质量滑块
    qualitySlider.value = 80;
    qualityValue.textContent = '80%';
}

/**
 * 压缩单个图片
 * @param {File} file - 图片文件
 * @param {number} quality - 压缩质量
 * @returns {Promise<void>}
 */
async function compressSingleImage(file, quality) {
    const item = imagesContainer.querySelector(`[data-filename="${file.name}"]`);
    const statusEl = item.querySelector('.status');
    const compressedSizeEl = item.querySelector('.compressed-size');
    
    try {
        statusEl.textContent = '压缩中...';
        statusEl.className = 'status';
        
        const compressedBlob = await compressImage(file, quality);
        compressedImages.set(file.name, compressedBlob);
        
        statusEl.textContent = '压缩完成';
        statusEl.className = 'status success';
        compressedSizeEl.textContent = `压缩后：${formatFileSize(compressedBlob.size)}`;
    } catch (error) {
        statusEl.textContent = '压缩失败';
        statusEl.className = 'status error';
        console.error(`压缩失败: ${file.name}`, error);
    }
}

/**
 * 批量压缩图片
 */
async function compressAllImages() {
    if (imageFiles.length === 0) return;
    
    const quality = qualitySlider.value / 100;
    
    // 禁用压缩按钮
    compressBtn.disabled = true;
    compressBtn.textContent = '压缩中...';
    
    try {
        // 并行压缩所有图片
        await Promise.all(
            imageFiles.map(file => compressSingleImage(file, quality))
        );
        
        // 启用下载按钮
        downloadAllBtn.style.display = 'block';
    } catch (error) {
        console.error('批量压缩失败:', error);
    } finally {
        // 恢复压缩按钮
        compressBtn.disabled = false;
        compressBtn.textContent = '开始压缩';
    }
}

/**
 * 下载所有压缩后的图片
 */
function downloadAllImages() {
    if (compressedImages.size === 0) return;
    
    // 创建 ZIP 文件
    const zip = new JSZip();
    
    // 添加所有压缩后的图片到 ZIP
    compressedImages.forEach((blob, filename) => {
        zip.file(filename, blob);
    });
    
    // 生成并下载 ZIP 文件
    zip.generateAsync({type: 'blob'}).then(content => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = 'compressed_images.zip';
        link.click();
    });
}

// 事件监听器
uploadArea.addEventListener('click', () => fileInput.click());

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = 'var(--primary-color)';
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.style.borderColor = '#DEDEDE';
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '#DEDEDE';
    handleImageUpload(e.dataTransfer.files);
});

fileInput.addEventListener('change', (e) => {
    handleImageUpload(e.target.files);
});

qualitySlider.addEventListener('input', (e) => {
    qualityValue.textContent = `${e.target.value}%`;
});

compressBtn.addEventListener('click', compressAllImages);
downloadAllBtn.addEventListener('click', downloadAllImages);

/**
 * 聊天功能相关代码
 */

// 聊天框相关 DOM 元素
const chatWidget = document.querySelector('.chat-widget');
const chatToggle = document.getElementById('chatToggle');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendMessage = document.getElementById('sendMessage');

// API 配置
const API_KEY = 'sk-npqrtqnqepazbutgzvhejmpcvberjmndnrkogokqduftjnnb';
const API_URL = 'https://api.siliconflow.cn/v1/chat/completions';

// 聊天框状态
let isMinimized = false;

/**
 * 添加消息到聊天框
 * @param {string} content - 消息内容
 * @param {string} role - 消息角色（'user' 或 'ai'）
 */
function addMessage(content, role) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}-message`;
    messageDiv.innerHTML = `
        <div class="message-content">
            ${content}
        </div>
    `;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * 发送消息到 AI API
 * @param {string} message - 用户消息
 * @returns {Promise<string>} AI 响应
 */
async function sendToAI(message) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'deepseek-ai/DeepSeek-R1',
                messages: [
                    {
                        role: 'user',
                        content: message
                    }
                ],
                stream: false,
                max_tokens: 512,
                temperature: 0.7,
                top_p: 0.7,
                top_k: 50,
                frequency_penalty: 0.5,
                n: 1,
                response_format: { type: 'text' }
            })
        });

        if (!response.ok) {
            throw new Error('API 请求失败');
        }

        const data = await response.json();
        return data.choices[0].message.content;
    } catch (error) {
        console.error('AI API 错误:', error);
        return '抱歉，我现在无法回答。请稍后再试。';
    }
}

/**
 * 处理消息发送
 */
async function handleSendMessage() {
    const message = chatInput.value.trim();
    if (!message) return;

    // 清空输入框
    chatInput.value = '';

    // 添加用户消息
    addMessage(message, 'user');

    // 显示加载状态
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message ai-message';
    loadingDiv.innerHTML = '<div class="message-content">正在思考...</div>';
    chatMessages.appendChild(loadingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // 获取 AI 响应
    const aiResponse = await sendToAI(message);

    // 移除加载状态
    chatMessages.removeChild(loadingDiv);

    // 添加 AI 响应
    addMessage(aiResponse, 'ai');
}

// 事件监听器
chatToggle.addEventListener('click', () => {
    isMinimized = !isMinimized;
    chatWidget.classList.toggle('minimized');
    chatToggle.textContent = isMinimized ? '+' : '×';
});

sendMessage.addEventListener('click', handleSendMessage);

chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
    }
});

// 自动调整输入框高度
chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = chatInput.scrollHeight + 'px';
}); 