require "net/http"

class VoiceCloner
  VOICES_ENDPOINT = URI("https://api.elevenlabs.io/v1/voices/add")

  class << self
    def configured?
      ENV["ELEVENLABS_API_KEY"].present?
    end

    def clone_voice(name, file_paths)
      boundary = SecureRandom.hex(16)
      parts = []
      parts << text_part(boundary, "name", name)
      file_paths.each do |path|
        parts << file_part(boundary, "files", File.basename(path), "audio/webm", File.binread(path))
      end
      parts << "--#{boundary}--\r\n"
      body = parts.map(&:b).join

      request = Net::HTTP::Post.new(VOICES_ENDPOINT)
      request["xi-api-key"] = ENV.fetch("ELEVENLABS_API_KEY")
      request["Content-Type"] = "multipart/form-data; boundary=#{boundary}"
      request.body = body

      response = Net::HTTP.start(VOICES_ENDPOINT.host, VOICES_ENDPOINT.port, use_ssl: true) do |http|
        http.request(request)
      end

      raise "VoiceCloner clone error: #{response.code} #{response.body}" unless response.is_a?(Net::HTTPSuccess)

      JSON.parse(response.body)["voice_id"]
    end

    def text_to_speech(voice_id, text)
      uri = URI("https://api.elevenlabs.io/v1/text-to-speech/#{voice_id}")
      request = Net::HTTP::Post.new(uri)
      request["xi-api-key"] = ENV.fetch("ELEVENLABS_API_KEY")
      request["Content-Type"] = "application/json"
      request.body = { text: text, model_id: "eleven_multilingual_v2" }.to_json

      response = Net::HTTP.start(uri.host, uri.port, use_ssl: true) { |http| http.request(request) }
      raise "VoiceCloner tts error: #{response.code} #{response.body}" unless response.is_a?(Net::HTTPSuccess)

      response.body
    end

    def delete_voice(voice_id)
      uri = URI("https://api.elevenlabs.io/v1/voices/#{voice_id}")
      request = Net::HTTP::Delete.new(uri)
      request["xi-api-key"] = ENV.fetch("ELEVENLABS_API_KEY")
      Net::HTTP.start(uri.host, uri.port, use_ssl: true) { |http| http.request(request) }
    end

    private

    def text_part(boundary, name, value)
      "--#{boundary}\r\nContent-Disposition: form-data; name=\"#{name}\"\r\n\r\n#{value}\r\n"
    end

    def file_part(boundary, name, filename, content_type, bytes)
      "--#{boundary}\r\n" \
        "Content-Disposition: form-data; name=\"#{name}\"; filename=\"#{filename}\"\r\n" \
        "Content-Type: #{content_type}\r\n\r\n#{bytes}\r\n"
    end
  end
end
