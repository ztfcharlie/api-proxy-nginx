package providers

import (
	"context"
	"edge-agent/internal/keystore"
	"edge-agent/internal/protocol"
	"fmt"
	"net/http"
	"strings"
	"time"

	v4 "github.com/aws/aws-sdk-go-v2/aws/signer/v4"
	"github.com/aws/aws-sdk-go-v2/credentials"
)

type AWSAdapter struct{}

func (a *AWSAdapter) GetBaseURL(instance *protocol.InstanceConfig) string {
	return "https://bedrock-runtime.us-east-1.amazonaws.com"
}

func (a *AWSAdapter) RewriteRequest(req *http.Request, instance *protocol.InstanceConfig) error {
	secret, ok := keystore.GlobalStore.Get(instance.ID)
	if !ok {
		return fmt.Errorf("credential not found for instance %s", instance.ID)
	}

	// Parse AK/SK from stored secret "ACCESS_KEY:SECRET_KEY:REGION"
	parts := strings.Split(secret, ":")
	if len(parts) < 3 {
		return fmt.Errorf("invalid AWS credentials format in keystore, expected AK:SK:REGION")
	}
	ak, sk, region := parts[0], parts[1], parts[2]

	credsProvider := credentials.NewStaticCredentialsProvider(ak, sk, "")
	creds, err := credsProvider.Retrieve(context.Background())
	if err != nil {
		return err
	}
	
	// Determine Service Name based on Host
	// bedrock-runtime.us-east-1.amazonaws.com -> bedrock
	serviceName := "bedrock"

	signer := v4.NewSigner()

	// Performance Optimization: Use UNSIGNED-PAYLOAD
	// This avoids reading the entire body into memory to calculate the hash.
	// Bedrock via HTTPS supports this.
	payloadHash := "UNSIGNED-PAYLOAD"

	// Sign the request
	// This adds Authorization, X-Amz-Date, X-Amz-Content-Sha256 headers
	signErr := signer.SignHTTP(req.Context(), creds, req, payloadHash, serviceName, region, time.Now())
	
	// Check for clock skew hint (heuristic)
	if signErr != nil && strings.Contains(signErr.Error(), "Time") {
		fmt.Printf("[AWS] Warning: Signing error. Check system clock sync! Error: %v\n", signErr)
	}
	
	return signErr
}

func (a *AWSAdapter) GetSniffer() Sniffer {
	return &AWSSniffer{}
}

type AWSSniffer struct {
	usage *protocol.Usage
}

func (s *AWSSniffer) Write(p []byte) (n int, err error) {
	// AWS Bedrock EventStream is binary.
	// Implementing a full EventStream parser is complex.
	// For MVP, we can fallback to Byte Counting or just pass-through.
	// TODO: Implement EventStream decoder
	return len(p), nil
}

func (s *AWSSniffer) GetUsage() *protocol.Usage {
	return s.usage
}