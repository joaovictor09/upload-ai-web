import { CheckCircle2, FileVideo, Upload } from "lucide-react";
import { Separator } from "./ui/separator";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { ChangeEvent, FormEvent, useMemo, useRef, useState } from "react";
import { getFFmpeg } from "@/lib/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { api } from "@/lib/axios";

type Status = 'waiting' | 'converting' | 'uploading' |'generating' | 'sucess' | 'error'



interface VideoInputFormProps {
  onVideoUploaded: (videoId: string) => void
}

export function VideoInputForm({ onVideoUploaded }: VideoInputFormProps) {
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [status, setStatus] = useState<Status>('waiting')
  const [loadingPercent, setLoadingPercent] = useState<number>(0)

  const statusMessages = {
    converting: `Convertendo(${loadingPercent}%)...`,
    uploading: 'Carregando...',
    generating: 'Transcrevendo... Quase lá',
    sucess: 'Sucesso!',
    error: 'Erro'
  }
  
  const promptInputRef = useRef<HTMLTextAreaElement>(null)
  
  function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const { files } = event.currentTarget

    if (!files) {
      return
    }

    const selectedFile = files[0]

    setVideoFile(selectedFile)
    setStatus('waiting')
  }

  async function convertVideoToAudio(video: File) {
    console.log('Convert started.')

    const ffmpeg = await getFFmpeg()

    await ffmpeg.writeFile('input.mp4', await fetchFile(video))

    // ffmpeg.on('log', log => {
    //   console.log(log)
    // })

    ffmpeg.on('progress', progress => {
      setLoadingPercent(Math.round(progress.progress * 100))
    })

    await ffmpeg.exec([
      '-i',
      'input.mp4',
      '-map',
      '0:a',
      '-b:a',
      '20k',
      '-acodec',
      'libmp3lame',
      'output.mp3'
    ])

    const data = await ffmpeg.readFile('output.mp3')

    const audioFileBlob = new Blob([data], { type: 'audio/mpeg' })
    const audioFile = new File([audioFileBlob], 'audio.mp3', {
      type: 'audio/mpeg'
    })

    console.log('Convert finished.')

    return audioFile
  }

  async function handleUploadAndTranscribeVideo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const prompt = promptInputRef.current?.value

    if (!videoFile) { 
      return
    }

    setStatus('converting')

    const audioFile = await convertVideoToAudio(videoFile)

    const data = new FormData()
    data.append('file', audioFile)

    setStatus('uploading')
    
    const response = await api.post('/videos', data)
    
    const videoId = response.data.video.id

    setStatus('generating')
    
    await api.post(`/videos/${videoId}/transcription`, { prompt })

    setStatus('sucess')
    
    onVideoUploaded(videoId)

  }

  const previewURL = useMemo(() => {
    if (!videoFile) {
      return null
    }

    return URL.createObjectURL(videoFile)
  }, [videoFile])
  
  return (
    <form className="space-y-6" onSubmit={handleUploadAndTranscribeVideo}>
      <label 
        htmlFor="video"
        data-border={!previewURL}
        className="border flex rounded-md relative transition-all overflow-hidden aspect-video cursor-pointer data-[border=false]:border-transparent border-dashed text-sm flex-col gap-2 items-center justify-center text-muted-foreground hover:bg-primary/5"  
      >
        {previewURL ? (
          <video src={previewURL} controls={false} className="pointer-events-none absolute inset-0"/>
        ) : (
          <>
            <FileVideo className="w-4 h-4" />
            Selecione um vídeo
          </>
        )}
      </label>

      <input type="file" id="video" accept="video/mp4" className="sr-only" onChange={handleFileSelected} />

      <Separator />

      <div className="space-y-2">
        <Label htmlFor="transcription_prompt">Prompt de transcrição</Label>
        <Textarea 
          ref={promptInputRef}
          disabled={status !== 'waiting'}
          id="transcription_prompt" 
          className="h-20 leading-relaxed resize-none"
          placeholder="Inclua palavras-chave mencionadas no vídeo separadas por vírgula(,)"
        />
      </div>

      <Button 
        variant={status === 'sucess' ? 'sucess' : 'default'}
        disabled={status !== 'waiting'} 
        data-generating={status === 'generating'}
        data-sucess={status === 'sucess'}
        type="submit" 
        className="w-full data-[generating=true]:animate-shake transition-all data-[sucess=true]:animate-success group"
      >
        {
          status === 'waiting' ? (
            <>
              Carregar vídeo
              <Upload className="w-4 h-4 ml-2 group-hover:animate-up-down" />
            </>
          )
          : status === 'sucess' ? (
            <>
              Sucesso!
              <CheckCircle2 className="w-4 h-4 ml-2" />
            </>
          )
          :statusMessages[status]
        }
      </Button>
    </form>
  )
}