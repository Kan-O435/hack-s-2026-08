# Be sure to restart your server when you modify this file.

# Avoid CORS issues when API is called from the frontend app.
# Handle Cross-Origin Resource Sharing (CORS) in order to accept cross-origin Ajax requests.

# Read more: https://github.com/cyu/rack-cors

Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins ENV.fetch("FRONTEND_ORIGIN", "http://localhost:3001")

    resource "/api/*",
      headers: :any,
      methods: [ :get, :post, :put, :patch, :delete, :options, :head ]

    # 冷笑図鑑の画像を共有カード合成のためcanvasで読み込む(fetch)必要があるため、
    # Active Storageのディスク配信ルートもCORS許可する(GETのみでよい)
    resource "/rails/active_storage/*",
      headers: :any,
      methods: [ :get, :options, :head ]
  end
end
