import React, { useRef, useState } from 'react';
import { Download, Image as ImageIcon, ImageOff, Upload } from 'lucide-react';
import { CanvasEditor } from './components/CanvasEditor';
import { ControlPanel } from './components/ControlPanel';
import { Layout } from './components/Layout';
import { Button } from './components/ui/Button';
import {
  editImage,
  editImageViaChatCompletions,
  generateImage,
  generateImageViaChatCompletions,
  uploadFile,
} from './lib/api';

function App() {
  const [imageUrl, setImageUrl] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [imageMimeType, setImageMimeType] = useState('image/png');
  const [imageRemoteUrl, setImageRemoteUrl] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const [apiKey, setApiKey] = useState(() => localStorage.getItem('apiKey') || '');
  const [baseUrl, setBaseUrl] = useState(() => localStorage.getItem('baseUrl') || 'https://foxi-ai.top');
  const [modelName, setModelName] = useState(() => localStorage.getItem('modelName') || 'nano-banana-2-2k');

  const [mode, setMode] = useState('generate'); // 'generate' | 'edit'
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawMode, setDrawMode] = useState('brush'); // 'brush' | 'rectangle' | 'eraser' | 'select'
  const [brushSize, setBrushSize] = useState(30);

  const [imageSize, setImageSize] = useState(() => localStorage.getItem('imageSize') || '1024x1024');
  const [aspectRatio, setAspectRatio] = useState(() => localStorage.getItem('aspectRatio') || '1:1');

  const canvasRef = useRef(null);
  const [regions, setRegions] = useState([]);
  const [regionInstructions, setRegionInstructions] = useState({});

  const resetCurrentImage = () => {
    setImageUrl(null);
    setImageBase64(null);
    setImageMimeType('image/png');
    setImageRemoteUrl(null);
    setMode('generate');
    setIsDrawing(false);
    setDrawMode('brush');
    setRegions([]);
    setRegionInstructions({});
    canvasRef.current = null;
  };

  const isChatImageModel = (name) =>
    name === 'gemini-3-pro-image-preview' || name === 'gemini-2.5-flash-image';

  const ensureCurrentImageRemoteUrl = async () => {
    if (imageRemoteUrl) return imageRemoteUrl;
    if (!imageBase64) return null;

    const dataUrl = `data:${imageMimeType};base64,${imageBase64}`;
    const uploaded = await uploadFile({
      dataUrl,
      apiKey,
      baseUrl,
      filename: 'image.png',
    });
    setImageRemoteUrl(uploaded.url);
    return uploaded.url;
  };

  React.useEffect(() => {
    localStorage.setItem('apiKey', apiKey);
  }, [apiKey]);

  React.useEffect(() => {
    localStorage.setItem('baseUrl', baseUrl);
  }, [baseUrl]);

  React.useEffect(() => {
    localStorage.setItem('modelName', modelName);
  }, [modelName]);

  React.useEffect(() => {
    localStorage.setItem('imageSize', imageSize);
  }, [imageSize]);

  React.useEffect(() => {
    localStorage.setItem('aspectRatio', aspectRatio);
  }, [aspectRatio]);

  const handleFileUpload = async (e) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;

    try {
      // 允许重复选择同一个文件也能触发 onChange
      input.value = '';
      // 避免异步加载竞态导致“新图不替换”
      resetCurrentImage();

      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
      });
      const mime = String(dataUrl).split(';')[0].split(':')[1] || 'image/png';
      const base64 = String(dataUrl).split(',')[1];
      setImageMimeType(mime);
      setImageBase64(base64);
      setImageUrl(String(dataUrl));
      setImageRemoteUrl(null);
      setMode('edit');
      setDrawMode('brush');
      setIsDrawing(true);
    } catch (err) {
      console.error('上传失败', err);
    }
  };

  const downloadCurrentImage = () => {
    if (!imageUrl) return;
    const a = document.createElement('a');
    a.href = imageUrl;
    const ext = imageMimeType === 'image/jpeg' ? 'jpg' : imageMimeType === 'image/webp' ? 'webp' : 'png';
    a.download = `图片_${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const buildMaskBase64 = () => {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error('画布未就绪');
    const bgImage = canvas.backgroundImage;
    if (!bgImage) throw new Error('未找到背景图片');

    const objects = canvas.getObjects();

    const originalBg = canvas.backgroundImage;
    const originalBgColor = canvas.backgroundColor;
    const originalStyles = objects.map((obj) => ({
      obj,
      fill: obj.fill,
      stroke: obj.stroke,
      strokeWidth: obj.strokeWidth,
      opacity: obj.opacity,
    }));

    try {
      canvas.discardActiveObject();
      canvas.backgroundImage = null;
      canvas.backgroundColor = 'black';
      objects.forEach((obj) => {
        if (obj.type === 'path' || obj.type === 'Path') {
          obj.set({ stroke: 'white', opacity: 1 });
        } else if (obj.type === 'rect') {
          obj.set({ fill: 'white', stroke: 'white', opacity: 1 });
        }
      });

      // 这里需要同步渲染，确保导出的 mask 与当前画面完全一致
      canvas.renderAll();

      // 不受视图缩放/平移影响：临时重置 viewportTransform，再按原图尺寸导出
      const originalVpt = canvas.viewportTransform;
      try {
        canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
        const maskDataUrl = canvas.toDataURL({
          format: 'png',
          left: 0,
          top: 0,
          width: bgImage.width,
          height: bgImage.height,
          multiplier: 1,
          enableRetinaScaling: false,
        });
        return maskDataUrl.split(',')[1];
      } finally {
        canvas.setViewportTransform(originalVpt);
      }
    } finally {
      canvas.backgroundImage = originalBg;
      canvas.backgroundColor = originalBgColor;
      originalStyles.forEach(({ obj, fill, stroke, strokeWidth, opacity }) => {
        obj.set({ fill, stroke, strokeWidth, opacity });
      });
      canvas.requestRenderAll();
    }
  };

  const clearMaskObjects = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getObjects().slice().forEach(obj => canvas.remove(obj));
    canvas.requestRenderAll();
  };

  const handleGenerate = async () => {
    if (!apiKey) {
      alert('请先在设置中填写 API Key');
      return;
    }

    setIsGenerating(true);
    try {
      if (mode === 'generate') {
        if (isChatImageModel(modelName)) {
          const { mimeType, base64 } = await generateImageViaChatCompletions({
            prompt,
            apiKey,
            baseUrl,
            model: modelName,
          });
          setImageMimeType(mimeType || 'image/png');
          setImageBase64(base64);
          setImageUrl(`data:${mimeType || 'image/png'};base64,${base64}`);
          setImageRemoteUrl(null);
          setMode('edit');
          setDrawMode('brush');
          setIsDrawing(true);
        } else {
          const result = await generateImage({
            prompt,
            apiKey,
            baseUrl,
            model: modelName,
            size: imageSize,
            aspectRatio: aspectRatio,
          });

          let b64 = result.data?.[0]?.b64_json;
          if (b64) {
            if (b64.startsWith('data:image')) b64 = b64.split(',')[1];
            setImageMimeType('image/png');
            setImageBase64(b64);
            setImageUrl(`data:image/png;base64,${b64}`);
            setImageRemoteUrl(null);
            setMode('edit');
            setDrawMode('brush');
            setIsDrawing(true);
          }
        }
      } else {
        if (!imageBase64) {
          console.error('缺少图片数据');
          return;
        }

        const maskBase64 = buildMaskBase64();

        let resultImage = null;
        if (isChatImageModel(modelName)) {
          // 关键：先把当前图片上传成 URL，再调用大模型（chat/completions）
          const imageUrlForModel = await ensureCurrentImageRemoteUrl();
          if (!imageUrlForModel) throw new Error('缺少图片数据');
          const maskDataUrl = `data:image/png;base64,${maskBase64}`;
          const { mimeType, base64 } = await editImageViaChatCompletions({
            imageDataUrl: imageUrlForModel,
            maskDataUrl,
            prompt,
            apiKey,
            baseUrl,
            model: modelName,
          });
          setImageMimeType(mimeType || 'image/png');
          setImageBase64(base64);
          setImageUrl(`data:${mimeType || 'image/png'};base64,${base64}`);
          setImageRemoteUrl(null);
          clearMaskObjects();
          return;
        } else {
          resultImage = await editImage({
            imageBase64,
            maskBase64,
            prompt,
            apiKey,
            baseUrl,
            model: modelName,
            imageMimeType,
          });
        }

        if (resultImage) {
          let b64 = resultImage;
          if (b64.startsWith('data:image')) b64 = b64.split(',')[1];
          setImageMimeType('image/png');
          setImageBase64(b64);
          setImageUrl(`data:image/png;base64,${b64}`);
          setImageRemoteUrl(null);
          clearMaskObjects();
        }
      }
    } catch (err) {
      console.error(err);
      alert(`出错：${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Layout
      sidebar={
        <div className="flex flex-col gap-4">
          <div className="relative group">
            <Button variant="ghost" size="icon" className="rounded-full w-12 h-12 bg-white shadow-sm">
              <Upload size={20} />
            </Button>
            <input
              type="file"
              className="absolute inset-0 opacity-0 cursor-pointer"
              onChange={handleFileUpload}
              accept="image/*"
            />
          </div>

          {imageUrl && (
            <>
              <div className="w-8 h-px bg-gray-300" />
              <Button
                variant={isDrawing ? 'primary' : 'ghost'}
                size="icon"
                className="rounded-full w-12 h-12"
                onClick={() => setIsDrawing(!isDrawing)}
                title="启用/暂停绘制"
              >
                <ImageIcon size={20} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full w-12 h-12"
                onClick={downloadCurrentImage}
                title="下载当前图片"
              >
                <Download size={20} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full w-12 h-12 text-red-500 hover:bg-red-50"
                onClick={resetCurrentImage}
                title="移除当前图片（重置）"
              >
                <ImageOff size={20} />
              </Button>
            </>
          )}
        </div>
      }
      properties={
        <ControlPanel
          prompt={prompt}
          setPrompt={setPrompt}
          onGenerate={handleGenerate}
          isGenerating={isGenerating}
          apiKey={apiKey}
          setApiKey={setApiKey}
          baseUrl={baseUrl}
          setBaseUrl={setBaseUrl}
          modelName={modelName}
          setModelName={setModelName}
          mode={mode}
          setMode={setMode}
          imageSize={imageSize}
          setImageSize={setImageSize}
          aspectRatio={aspectRatio}
          setAspectRatio={setAspectRatio}
          regions={regions}
          regionInstructions={regionInstructions}
          setRegionInstruction={(id, text) =>
            setRegionInstructions((prev) => ({ ...prev, [id]: text }))
          }
          focusRegion={(id) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getObjects().find((o) => o.type === 'rect' && o.regionId === id);
            if (!rect) return;
            setDrawMode('select');
            setIsDrawing(false);
            canvas.setActiveObject(rect);
            canvas.requestRenderAll();
          }}
        />
      }
    >
      <div className="flex-1 w-full h-full p-4">
        {imageUrl ? (
          <CanvasEditor
            imageUrl={imageUrl}
            isDrawing={isDrawing}
            setIsDrawing={setIsDrawing}
            drawMode={drawMode}
            setDrawMode={setDrawMode}
            brushSize={brushSize}
            setBrushSize={setBrushSize}
            onRegionsChange={(next) => {
              setRegions(next);
              setRegionInstructions((prev) => {
                const keep = new Set(next.map((r) => r.id));
                const nextMap = {};
                Object.keys(prev).forEach((k) => {
                  const id = Number(k);
                  if (keep.has(id)) nextMap[id] = prev[id];
                });
                return nextMap;
              });
            }}
            onCanvasReady={(canvas) => {
              canvasRef.current = canvas;
            }}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-ios-lg">
            <ImageIcon size={48} className="mb-4 opacity-50" />
            <p className="text-lg font-medium">暂无图片</p>
            <p className="text-sm">上传图片或先生成一张图片开始编辑</p>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default App;
