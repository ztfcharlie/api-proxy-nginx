package billing

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"strings"

	"github.com/tcolgate/mp3"
	"github.com/youpy/go-wav"
)

type AudioProvider struct{}

func (s *AudioProvider) CanHandle(model string, path string) bool {
	// OpenAI Audio Endpoints
	return strings.Contains(path, "/audio/transcriptions") || strings.Contains(path, "/audio/translations")
}

func (s *AudioProvider) Calculate(model string, reqBody, resBody []byte, contentType string, statusCode int) (Usage, error) {
	var u Usage
	if statusCode != 200 {
		return u, nil
	}

	// Parse multipart form
	mediaType, params, err := mime.ParseMediaType(contentType)
	if err != nil || !strings.HasPrefix(mediaType, "multipart/") {
		return u, nil // Not multipart, maybe JSON (not standard for audio upload)
	}

	boundary, ok := params["boundary"]
	if !ok {
		return u, errors.New("no boundary in content type")
	}

	reader := multipart.NewReader(bytes.NewReader(reqBody), boundary)
	
	for {
		part, err := reader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			return u, err
		}

		if part.FormName() == "file" {
			// Read file content
			fileData, err := io.ReadAll(part)
			if err != nil {
				return u, err
			}
			
			duration, err := getAudioDuration(fileData, part.FileName())
			if err == nil {
				u.AudioSeconds = duration
			}
			// Only process the first file
			break
		}
	}

	return u, nil
}

func getAudioDuration(data []byte, filename string) (float64, error) {
	filename = strings.ToLower(filename)
	
	if strings.HasSuffix(filename, ".mp3") {
		return getMp3Duration(data)
	} else if strings.HasSuffix(filename, ".wav") {
		return getWavDuration(data)
	}
	
	// TODO: Support other formats (ogg, flac, webm)
	// For unknown formats, maybe fallback to file size estimation?
	// 1MB mp3 ~ 1 minute? Very inaccurate.
	// For now, return 0 error
	return 0, fmt.Errorf("unsupported audio format")
}

func getMp3Duration(data []byte) (float64, error) {
	d := mp3.NewDecoder(bytes.NewReader(data))
	var duration float64
	var f mp3.Frame
	var skipped int

	for {
		if err := d.Decode(&f, &skipped); err != nil {
			if err == io.EOF {
				break
			}
			return duration, err
		}
		duration += f.Duration().Seconds()
	}
	return duration, nil
}

func getWavDuration(data []byte) (float64, error) {
	reader := bytes.NewReader(data)
	w := wav.NewReader(reader)
	duration, err := w.Duration()
	if err != nil {
		return 0, err
	}
	return duration.Seconds(), nil
}
