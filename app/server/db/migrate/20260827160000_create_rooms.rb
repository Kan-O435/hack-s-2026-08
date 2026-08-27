class CreateRooms < ActiveRecord::Migration[8.1]
  def change
    create_table :rooms do |t|
      t.string :name, null: false
      t.string :passcode, null: false
      t.references :host_user, null: false, foreign_key: { to_table: :users }
      t.integer :status, null: false, default: 0
      t.datetime :started_at
      t.datetime :finished_at
      t.boolean :has_alcohol, null: false, default: false
      t.text :summary_text
      t.references :top_user, foreign_key: { to_table: :users }

      t.timestamps
    end

    add_index :rooms, :passcode, unique: true
  end
end
