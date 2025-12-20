package proxy

import (
	"edge-agent/internal/protocol"
	"errors"
	"io"
	"time"
)

// RequestStreamer 负责将 WS Chunks 转为 Reader
type RequestStreamer struct {
	ReqID     string
	pw        *io.PipeWriter
	pr        *io.PipeReader
	Meta      protocol.HttpRequestPayload
	MetaReady chan struct{}
	
	// 新增: 数据缓冲通道，解耦 WebSocket 读取和 HTTP 发送
	chunkChan chan []byte
}

func NewRequestStreamer(reqID string) *RequestStreamer {
	pr, pw := io.Pipe()
	s := &RequestStreamer{
		ReqID:     reqID,
		pr:        pr,
		pw:        pw,
		MetaReady: make(chan struct{}),
		// 允许缓冲 50 个分片 (50 * 32KB = 1.6MB)，足够应对网络抖动
		chunkChan: make(chan []byte, 50),
	}
	
	// 启动搬运工
	go s.pump()
	return s
}

// pump 负责从 channel 取数据写入 pipe，这样就不会阻塞主循环
func (s *RequestStreamer) pump() {
	defer s.pw.Close() // 确保退出时关闭 PipeWriter，触发 EOF

	for chunk := range s.chunkChan {
		// 这里的 Write 可能会阻塞 (如果 HTTP 发送太慢)
		// 但因为它是在独立 Goroutine 里，不会影响主循环的心跳
		if _, err := s.pw.Write(chunk); err != nil {
			return // Reader 关闭了 (请求取消)，退出
		}
	}
}

// WriteChunk 非阻塞写入 (如果缓冲区满，返回错误)
func (s *RequestStreamer) WriteChunk(payload protocol.HttpRequestPayload) error {
	if payload.Method != "" {
		s.Meta = payload
		select {
		case <-s.MetaReady:
		default:
			close(s.MetaReady)
		}
	}

	if len(payload.BodyChunk) > 0 {
		select {
		case s.chunkChan <- payload.BodyChunk:
			// 写入成功
		case <-time.After(100 * time.Millisecond):
			// 缓冲区满了，说明 OpenAI 发送太慢，或者卡死了
			// 为了保护 Agent 内存，我们要丢弃这个请求
			return errors.New("stream buffer full (slow network)")
		}
	}

	if payload.IsFinal {
		close(s.chunkChan) // 关闭通道，通知 pump 退出
	}
	
	return nil
}

func (s *RequestStreamer) GetBodyReader() io.Reader {
	return s.pr
}