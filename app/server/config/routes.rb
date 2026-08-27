Rails.application.routes.draw do
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  namespace :api do
    namespace :v1 do
      resources :sessions, only: [ :create ]
      resources :rooms, only: [ :create, :show ]
      post "rooms/:passcode/join", to: "rooms#join"
      patch "rooms/:id/start", to: "rooms#start"
      patch "rooms/:id/finish", to: "rooms#finish"
      get "rooms/:id/result", to: "rooms#result"
      post "rooms/:room_id/utterances", to: "utterances#create"
      put "utterances/:id/sneer_photo", to: "sneer_photos#update"
      delete "utterances/:id/sneer_photo", to: "sneer_photos#destroy"
      get "me/rooms", to: "me#rooms"
      get "me/sneer_cards", to: "me#sneer_cards"
    end
  end

  mount ActionCable.server => "/cable"

  # Defines the root path route ("/")
  # root "posts#index"
end
