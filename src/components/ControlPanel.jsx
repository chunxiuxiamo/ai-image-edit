import React from 'react';
import { Button } from './ui/Button';
import { Settings, Sparkles, Image as ImageIcon, Type, Plus, X } from 'lucide-react';
import { cn } from '../lib/utils';

export function ControlPanel({
    prompt,
    setPrompt,
    onGenerate,
    isGenerating,
    apiKey,
    setApiKey,
    baseUrl,
    setBaseUrl,
    modelName,
    setModelName,
    mode,
    setMode,
    imageSize,
    setImageSize,
    aspectRatio,
    setAspectRatio,
    regions = [],
    regionInstructions = {},
    setRegionInstruction,
    focusRegion,
}) {
    const [showSettings, setShowSettings] = React.useState(false);
    const [copyHint, setCopyHint] = React.useState('');
    const [customModels, setCustomModels] = React.useState(() => {
        try {
            return JSON.parse(localStorage.getItem('customModels') || '[]');
        } catch {
            return [];
        }
    });
    const [newModelName, setNewModelName] = React.useState('');

    // 保存自定义模型到localStorage
    React.useEffect(() => {
        localStorage.setItem('customModels', JSON.stringify(customModels));
    }, [customModels]);

    // 添加自定义模型
    const addCustomModel = () => {
        const trimmedName = newModelName.trim();
        if (!trimmedName) return;
        
        const defaultModels = [
            'nano-banana-2-2k',
            'nano-banana-2',
            'nano-banana-2-4k', 
            'nano-banana',
            'gemini-3-pro-image-preview',
            'gemini-2.5-flash-image'
        ];
        
        if (defaultModels.includes(trimmedName) || customModels.includes(trimmedName)) {
            alert('该模型已存在');
            return;
        }
        
        setCustomModels(prev => [...prev, trimmedName]);
        setNewModelName('');
    };

    // 删除自定义模型
    const removeCustomModel = (modelToRemove) => {
        setCustomModels(prev => prev.filter(model => model !== modelToRemove));
        // 如果删除的是当前选中的模型，切换到默认模型
        if (modelName === modelToRemove) {
            setModelName('nano-banana-2-2k');
        }
    };

    // 获取所有模型选项
    const getAllModels = () => {
        const defaultModels = [
            'nano-banana-2-2k',
            'nano-banana-2',
            'nano-banana-2-4k',
            'nano-banana',
            'gemini-3-pro-image-preview',
            'gemini-2.5-flash-image'
        ];
        return [...defaultModels, ...customModels];
    };

    const copyToClipboard = async (text) => {
        if (!text) return false;
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            try {
                const el = document.createElement('textarea');
                el.value = text;
                el.style.position = 'fixed';
                el.style.left = '-9999px';
                document.body.appendChild(el);
                el.focus();
                el.select();
                const ok = document.execCommand('copy');
                document.body.removeChild(el);
                return ok;
            } catch {
                return false;
            }
        }
    };

    const composeRegionsPrompt = () => {
        if (!regions || regions.length === 0) return '';
        const lines = [];
        lines.push('请按以下区域分别进行编辑（坐标为原图像素，格式：#编号[x,y,w,h]）：');
        regions.forEach((r) => {
            const instr = (regionInstructions?.[r.id] || '').trim();
            lines.push(
                `#${r.id}[${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}]：${instr || '（在右侧为该区域填写要修改的内容）'}`
            );
        });
        return lines.join('\n');
    };

    return (
        <div className="flex flex-col h-full gap-6 p-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold tracking-tight text-slate-900">控制面板</h2>
                <Button variant="ghost" size="icon" onClick={() => setShowSettings(!showSettings)}>
                    <Settings size={20} />
                </Button>
            </div>

            {showSettings && (
                <div className="flex flex-col gap-4 p-4 bg-white/50 rounded-ios-md border border-white/60 shadow-sm animate-in fade-in slide-in-from-top-2">
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-slate-500">API Key</label>
                        <input
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            className="w-full px-3 py-2 bg-white/80 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                            placeholder="sk-..."
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-slate-500">接口地址</label>
                        <input
                            type="text"
                            value={baseUrl}
                            onChange={(e) => setBaseUrl(e.target.value)}
                            className="w-full px-3 py-2 bg-white/80 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                            placeholder="https://..."
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-slate-500">模型名称</label>
                        <select
                            value={modelName}
                            onChange={(e) => setModelName(e.target.value)}
                            className="w-full px-3 py-2 bg-white/80 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                        >
                            {getAllModels().map(model => (
                                <option key={model} value={model}>{model}</option>
                            ))}
                        </select>
                        
                        {/* 自定义模型管理 */}
                        <div className="mt-3 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold uppercase tracking-widest text-slate-500">自定义模型</span>
                            </div>
                            
                            {/* 添加新模型 */}
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newModelName}
                                    onChange={(e) => setNewModelName(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && addCustomModel()}
                                    className="flex-1 px-2 py-1 bg-white/80 rounded border border-gray-200 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400"
                                    placeholder="输入模型名称"
                                />
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={addCustomModel}
                                    className="px-2 py-1 h-auto"
                                >
                                    <Plus size={14} />
                                </Button>
                            </div>
                            
                            {/* 显示自定义模型列表 */}
                            {customModels.length > 0 && (
                                <div className="space-y-1 max-h-24 overflow-y-auto">
                                    {customModels.map(model => (
                                        <div key={model} className="flex items-center justify-between bg-white/50 rounded px-2 py-1">
                                            <span className="text-xs text-slate-700 flex-1 truncate">{model}</span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => removeCustomModel(model)}
                                                className="px-1 py-0 h-auto text-red-500 hover:text-red-700"
                                            >
                                                <X size={12} />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="space-y-4">
                <div className="flex p-1 bg-gray-200/50 rounded-xl">
                    <button
                        onClick={() => setMode('generate')}
                        className={cn(
                            "flex-1 py-2 text-sm font-medium rounded-lg transition-all",
                            mode === 'generate' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
                        )}
                    >
                        生成
                    </button>
                    <button
                        onClick={() => setMode('edit')}
                        className={cn(
                            "flex-1 py-2 text-sm font-medium rounded-lg transition-all",
                            mode === 'edit' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
                        )}
                    >
                        编辑
                    </button>
                </div>

                {mode === 'generate' && (
                    <>
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">图片尺寸</label>
                            <select
                                value={imageSize}
                                onChange={(e) => setImageSize(e.target.value)}
                                className="w-full px-3 py-2 bg-white/80 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                            >
                                <option value="1024x1024">1K（1024×1024）</option>
                                <option value="2048x2048">2K（2048×2048）</option>
                                <option value="4096x4096">4K（4096×4096）</option>
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">宽高比</label>
                            <select
                                value={aspectRatio}
                                onChange={(e) => setAspectRatio(e.target.value)}
                                className="w-full px-3 py-2 bg-white/80 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                            >
                                <option value="1:1">1:1（方形）</option>
                                <option value="16:9">16:9（横向）</option>
                                <option value="9:16">9:16（竖向）</option>
                                <option value="4:3">4:3</option>
                                <option value="3:4">3:4</option>
                            </select>
                        </div>
                    </>
                )}

                <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-500">
                        {mode === 'generate' ? '提示词' : '编辑指令'}
                    </label>
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        className="w-full h-32 px-4 py-3 bg-white/60 backdrop-blur-sm rounded-ios-md border border-white/60 shadow-inner-cut resize-none focus:outline-none focus:ring-2 focus:ring-slate-400 text-slate-800 placeholder:text-slate-400"
                        placeholder={mode === 'generate' ? "描述你想生成的图片（风格、光影、主体、细节）…" : "先框选/涂抹需要修改的区域，再描述如何修改…"}
                    />
                </div>

                <Button
                    onClick={onGenerate}
                    disabled={isGenerating || !prompt}
                    className="w-full h-14 text-lg shadow-soft-spread"
                >
                    {isGenerating ? (
                        <span className="flex items-center gap-2">
                            <Sparkles className="animate-spin" /> 处理中…
                        </span>
                    ) : (
                        <span className="flex items-center gap-2">
                            <Sparkles /> {mode === 'generate' ? '生成图片' : '应用编辑'}
                        </span>
                    )}
                </Button>
            </div>

            {mode === 'edit' && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-900">矩形区域</h3>
                        {copyHint && <span className="text-xs text-slate-500">{copyHint}</span>}
                    </div>

                    {regions.length === 0 ? (
                        <div className="p-3 bg-white/50 rounded-ios-md border border-white/60 text-xs text-slate-600">
                            还没有矩形框选。请选择底部“矩形框选”工具，在图片上拖拽创建多个区域。
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {regions.map((r) => (
                                <div
                                    key={r.id}
                                    className="p-3 bg-white/50 rounded-ios-md border border-white/60 shadow-sm"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="text-sm font-semibold text-slate-900">区域 #{r.id}</div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => focusRegion?.(r.id)}
                                            title="在画布中选中该区域"
                                        >
                                            定位
                                        </Button>
                                    </div>
                                    <div className="mt-1 text-xs text-slate-600">
                                        x={Math.round(r.x)}，y={Math.round(r.y)}，w={Math.round(r.width)}，h={Math.round(r.height)}
                                    </div>
                                    <textarea
                                        value={regionInstructions?.[r.id] || ''}
                                        onChange={(e) => setRegionInstruction?.(r.id, e.target.value)}
                                        className="mt-2 w-full h-16 px-3 py-2 bg-white/70 rounded-ios-md border border-white/60 shadow-inner-cut resize-none focus:outline-none focus:ring-2 focus:ring-slate-400 text-slate-800 placeholder:text-slate-400 text-sm"
                                        placeholder="填写该区域要修改成什么，例如：把衣服变成黑色皮夹克…"
                                    />
                                </div>
                            ))}

                            <div className="flex items-center gap-2">
                                <Button
                                    variant="secondary"
                                    className="flex-1"
                                    onClick={() => {
                                        setPrompt(composeRegionsPrompt());
                                        setCopyHint('已写入到提示词');
                                        setTimeout(() => setCopyHint(''), 1500);
                                    }}
                                >
                                    写入到提示词
                                </Button>
                                <Button
                                    variant="secondary"
                                    className="flex-1"
                                    onClick={async () => {
                                        const ok = await copyToClipboard(composeRegionsPrompt());
                                        setCopyHint(ok ? '已复制' : '复制失败');
                                        setTimeout(() => setCopyHint(''), 1500);
                                    }}
                                >
                                    复制模板
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="mt-auto">
                <div className="p-4 bg-blue-50/50 rounded-ios-md border border-blue-100/50">
                    <h4 className="text-sm font-semibold text-blue-900 mb-1">提示</h4>
                    <p className="text-xs text-blue-700/80 leading-relaxed">
                        {mode === 'generate'
                            ? "建议描述：主体、风格、光线、构图、材质、氛围，可获得更稳定效果。"
                            : "先用画笔/矩形选中要修改的区域，再用编辑指令描述需要变更的内容。"}
                    </p>
                </div>
            </div>
        </div>
    );
}
